import type { FetchMessage, UpdateMessage } from '@/schemas/message.dto.ts'
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
    const detail = await provider.fetchTitle(message.contentId)

    const { metadata } = detail
    const identifiedData = {
      tmdbId: metadata.tmdbId,
      aniListId: metadata.aniListId,
      title: metadata.title,
      status: metadata.status,
      year: metadata.year,
      quarter: metadata.quarter,
      isIdentified: true
    }

    await this.prisma.anime.upsert({
      where: {
        provider_contentId: {
          provider: message.provider,
          contentId: message.contentId
        }
      },
      create: {
        provider: message.provider,
        contentId: message.contentId,
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

    const anime = await this.prisma.anime.findUniqueOrThrow({
      where: {
        provider_contentId: {
          provider: message.provider,
          contentId: message.contentId
        }
      },
      include: {
        seasons: {
          include: { episodes: { select: { episodeNumber: true } } }
        }
      }
    })

    // 既存シーズン → 既存エピソード番号のMap
    const existingSeasons = new Map(
      anime.seasons.map((s) => [s.seasonNumber, new Set(s.episodes.map((e) => e.episodeNumber))])
    )

    let seasonsCreated = 0
    let episodesCreated = 0

    for (const season of detail.seasons) {
      const existingEpisodes = existingSeasons.get(season.seasonNumber)

      if (!existingEpisodes) {
        // シーズンごとcreate（エピソード含む）
        await this.prisma.season.create({
          data: {
            animeId: anime.id,
            seasonId: season.seasonId,
            displayName: season.displayName,
            seasonNumber: season.seasonNumber,
            imageUrl: season.imageUrl ?? null,
            episodes: {
              create: season.episodes.map((ep) => ({
                episodeNumber: ep.episodeNumber,
                episodeId: ep.episodeId,
                title: ep.title,
                description: ep.description,
                releaseDate: ep.releaseDate,
                duration: ep.duration,
                maturityRating: ep.maturityRating ?? null,
                imageUrl: ep.imageUrl,
                hasSubtitles: ep.hasSubtitles,
                hasDub: ep.hasDub,
                benefitId: ep.benefitId ?? null
              }))
            }
          }
        })
        seasonsCreated++
        episodesCreated += season.episodes.length
        continue
      }

      // 既存シーズン → 不足エピソードだけ追加
      const dbSeason = anime.seasons.find((s) => s.seasonNumber === season.seasonNumber)
      if (!dbSeason) continue
      const newEpisodes = season.episodes.filter((ep) => !existingEpisodes.has(ep.episodeNumber))

      for (const ep of newEpisodes) {
        await this.prisma.episode.create({
          data: {
            seasonId: dbSeason.id,
            episodeNumber: ep.episodeNumber,
            episodeId: ep.episodeId,
            title: ep.title,
            description: ep.description,
            releaseDate: ep.releaseDate,
            duration: ep.duration,
            maturityRating: ep.maturityRating ?? null,
            imageUrl: ep.imageUrl,
            hasSubtitles: ep.hasSubtitles,
            hasDub: ep.hasDub,
            benefitId: ep.benefitId ?? null
          }
        })
        episodesCreated++
      }
    }

    logger.info({
      context: 'sync',
      action: 'update',
      provider: message.provider,
      contentId: message.contentId,
      seasonsCreated,
      episodesCreated
    })
  }

  /**
   * 更新すべきタイトルのコンテンツIDを取得する
   * @param param0
   */
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
      provider: provider.name
    })
    const results = await Promise.allSettled(
      newTitles.map(async (title) => {
        const identified = await adapter.identify(title.title)
        if (!identified) {
          logger.warn({
            context: 'sync',
            action: 'unidentified',
            provider: provider.name,
            title: title.title,
            search: cleanTitle(title.title),
            contentId: title.contentId
          })
          return null
        }
        return title.contentId
      })
    )

    return [
      ...titles.filter((t) => existingIds.has(t.contentId)).map((t) => t.contentId),
      ...results
        .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
        .flatMap((r) => (r.value ? [r.value] : []))
    ]
  }
}
