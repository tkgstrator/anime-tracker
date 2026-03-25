import type { FetchMessage, UpdateMessage } from '@/schemas/message.dto.ts'
import type { Episode, Season } from '@/schemas/providers/common.dto.ts'
import type { TitleDetailedInfo } from '@/schemas/providers/metadata.dto.ts'
import type { PrismaClient } from '../generated/prisma/client.ts'
import { logger } from './logger'
import { AniListAdapter, cleanTitle } from './metadata/anilist'
import { AmazonProvider } from './providers/amazon'
import type { Provider } from './providers/base'
import { HuluProvider } from './providers/hulu'

const adapter = new AniListAdapter()

const providers: Record<string, Provider> = {
  amazon: new AmazonProvider(adapter),
  hulu: new HuluProvider(adapter)
}

function getProvider(name: string): Provider {
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown provider: ${name}`)
  return provider
}

export class SyncService {
  constructor(private readonly prisma: PrismaClient) {}

  /** プロバイダの新着をチェックし、不足しているシーズン・エピソードを同期する */
  async update({ message }: UpdateMessage): Promise<void> {
    const provider = getProvider(message.provider)
    const detail = await provider.fetchTitleDetailedInfo(message.contentId)

    const animeId = await this.upsertAnime(message.provider, message.contentId, detail)
    await this.syncSeasons(animeId, message.provider, message.contentId, detail.seasons)

    logger.info({
      context: 'sync',
      action: 'update',
      provider: message.provider,
      contentId: message.contentId
    })
  }

  /** アニメ情報をメタデータ付きでupsertし、IDを返す */
  private async upsertAnime(provider: string, contentId: string, detail: TitleDetailedInfo): Promise<string> {
    const { metadata } = detail
    const identifiedData = {
      aniListId: metadata.aniListId ?? 0,
      title: metadata.title,
      status: metadata.status,
      year: metadata.year,
      quarter: metadata.quarter,
      isIdentified: true
    }

    const anime = await this.prisma.anime.upsert({
      where: { provider_contentId: { provider, contentId } },
      create: {
        provider,
        contentId,
        description: detail.description,
        entityType: detail.entityType,
        maturityRating: detail.maturityRating,
        imageUrl: detail.imageUrl,
        benefitId: detail.benefitId,
        ...identifiedData
      },
      update: {
        description: detail.description,
        imageUrl: detail.imageUrl,
        ...identifiedData
      }
    })

    return anime.id
  }

  /** 既存シーズン・エピソードと差分比較し、不足分を追加する */
  private async syncSeasons(animeId: string, provider: string, contentId: string, seasons: Season[]): Promise<void> {
    const anime = await this.prisma.anime.findUniqueOrThrow({
      where: { provider_contentId: { provider, contentId } },
      include: {
        seasons: {
          include: { episodes: { select: { episodeNumber: true } } }
        }
      }
    })

    const existingSeasons = new Map(
      anime.seasons.map((s) => [s.seasonNumber, new Set(s.episodes.map((e) => e.episodeNumber))])
    )

    for (const season of seasons) {
      const existingEpisodes = existingSeasons.get(season.seasonNumber)

      if (!existingEpisodes) {
        await this.createSeason(animeId, season)
        continue
      }

      const dbSeason = anime.seasons.find((s) => s.seasonNumber === season.seasonNumber)
      if (!dbSeason) continue
      const newEpisodes = season.episodes.filter((ep) => !existingEpisodes.has(ep.episodeNumber))
      for (const episode of newEpisodes) {
        await this.createEpisode(dbSeason.id, episode)
      }
    }
  }

  /** シーズンをエピソード込みで一括作成する */
  private async createSeason(animeId: string, season: Season): Promise<void> {
    await this.prisma.season.create({
      data: {
        animeId,
        seasonId: season.seasonId,
        displayName: season.displayName,
        seasonNumber: season.seasonNumber,
        imageUrl: season.imageUrl ?? '',
        episodes: {
          create: season.episodes.map((episode) => ({
            episodeNumber: episode.episodeNumber,
            episodeId: episode.episodeId,
            title: episode.title,
            description: episode.description,
            releaseDate: episode.releaseDate,
            duration: episode.duration,
            maturityRating: episode.maturityRating,
            imageUrl: episode.imageUrl,
            hasSubtitles: episode.hasSubtitles,
            hasDub: episode.hasDub,
            benefitId: episode.benefitId
          }))
        }
      }
    })
  }

  /** 既存シーズンに不足エピソードを1件追加する */
  private async createEpisode(seasonId: string, episode: Episode): Promise<void> {
    await this.prisma.episode.create({
      data: {
        seasonId,
        episodeNumber: episode.episodeNumber,
        episodeId: episode.episodeId,
        title: episode.title,
        description: episode.description,
        releaseDate: episode.releaseDate,
        duration: episode.duration,
        maturityRating: episode.maturityRating,
        imageUrl: episode.imageUrl,
        hasSubtitles: episode.hasSubtitles,
        hasDub: episode.hasDub,
        benefitId: episode.benefitId
      }
    })
  }

  /** プロバイダからタイトル一覧を取得し、更新対象のコンテンツIDを返す */
  async fetch({ message }: FetchMessage): Promise<string[]> {
    const provider = getProvider(message.provider)
    const titles = await provider.fetchTitleList({ newEpisodesOnly: true })
    const existingIds = new Set(
      (
        await this.prisma.anime.findMany({
          where: { contentId: { in: titles.map((t) => t.contentId) } },
          select: { contentId: true }
        })
      ).map((a) => a.contentId)
    )
    const newTitles = titles.filter((t) => !existingIds.has(t.contentId))
    logger.info({
      context: 'fetch',
      action: 'check-titles',
      provider: provider.name,
      total: titles.length,
      existing: existingIds.size,
      new: newTitles.length
    })

    // 50件ずつバッチで AniList 識別（1バッチ = 1 API リクエスト）
    const BATCH_SIZE = 50
    const identifiedContentIds: string[] = []

    for (let i = 0; i < newTitles.length; i += BATCH_SIZE) {
      const batch = newTitles.slice(i, i + BATCH_SIZE)
      const results = await adapter.identifyBatch(batch.map((t) => t.title))

      for (let j = 0; j < batch.length; j++) {
        if (results[j]) {
          identifiedContentIds.push(batch[j].contentId)
        } else {
          logger.warn({
            context: 'sync',
            action: 'unidentified',
            provider: provider.name,
            title: batch[j].title,
            search: cleanTitle(batch[j].title),
            contentId: batch[j].contentId
          })
        }
      }
    }

    return [
      ...titles.filter((t) => existingIds.has(t.contentId)).map((t) => t.contentId),
      ...identifiedContentIds
    ]
  }
}
