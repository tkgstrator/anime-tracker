import dayjs from 'dayjs'
import type { FetchMessage, UpdateMessage } from '@/schemas/message.dto.ts'
import type { Episode, Season, Title } from '@/schemas/providers/common.dto.ts'
import type { PrismaClient } from '../generated/prisma/client.ts'
import { logger } from './logger'
import { AniListAdapter, cleanTitle } from './metadata/anilist'
import { AmazonProvider } from './providers/amazon'
import type { Provider } from './providers/base'
import { HuluProvider } from './providers/hulu'

const adapter = new AniListAdapter()

/** D1 の SQL 変数上限 (999) を超えないよう IN 句をチャンク分割して findMany する */
const D1_VARIABLE_LIMIT = 500

async function findExistingContentIds(prisma: PrismaClient, contentIds: string[]): Promise<Set<string>> {
  const results: string[] = []
  for (let i = 0; i < contentIds.length; i += D1_VARIABLE_LIMIT) {
    const chunk = contentIds.slice(i, i + D1_VARIABLE_LIMIT)
    const rows = await prisma.anime.findMany({
      where: { contentId: { in: chunk } },
      select: { contentId: true }
    })
    results.push(...rows.map((r) => r.contentId))
  }
  return new Set(results)
}

const providers: Record<string, Provider> = {
  amazon: new AmazonProvider(),
  hulu: new HuluProvider()
}

function getProvider(name: string): Provider {
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown provider: ${name}`)
  return provider
}

/** ISO 8601 文字列を Date に変換し、過去なら null を返す */
function parseFutureDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const d = dayjs(dateStr)
  return d.isAfter(dayjs()) ? d.toDate() : null
}

/** Title.expiring から DB 用の expiredAt / expiringSeason を算出する */
function computeExpiringFields(title: Title): { expiredAt: Date | null; expiringSeason: number | null } {
  if (!title.expiring) return { expiredAt: null, expiringSeason: null }
  return {
    expiredAt: dayjs().add(title.expiring.remainingHours, 'hour').toDate(),
    expiringSeason: title.expiring.season
  }
}

export class SyncService {
  constructor(private readonly prisma: PrismaClient) {}

  /** プロバイダのエピソード情報を取得し、不足しているシーズン・エピソードを同期する */
  async update({ message }: UpdateMessage): Promise<void> {
    const provider = getProvider(message.provider)
    const detail = await provider.fetchTitleInfo(message.contentId)

    const anime = await this.prisma.anime.findUniqueOrThrow({
      where: { provider_contentId: { provider: message.provider, contentId: message.contentId } }
    })

    await this.syncSeasons(anime.id, message.provider, message.contentId, detail.seasons)

    logger.info({
      context: 'sync',
      action: 'update',
      provider: message.provider,
      contentId: message.contentId
    })
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
            releaseDate: dayjs(episode.releaseDate).toDate(),
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
        releaseDate: new Date(episode.releaseDate),
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
    if (message.category === 'expiring') {
      return this.fetchExpiring(message.provider)
    }
    return this.fetchNewEpisode(message.provider)
  }

  /** 新着エピソード取得: AniList 識別 + DB INSERT + nextEpisodeDate 更新 */
  private async fetchNewEpisode(providerName: string): Promise<string[]> {
    const provider = getProvider(providerName)
    const titles = await provider.fetchTitleList({ newEpisodesOnly: true })
    const existingIds = await findExistingContentIds(
      this.prisma,
      titles.map((t) => t.contentId)
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

    // browse API に含まれなかったタイトルの nextEpisodeDate をリセット
    const allContentIds = new Set(titles.map((t) => t.contentId))
    const titlesHavingNextDate = await this.prisma.anime.findMany({
      where: { provider: provider.name, nextEpisodeDate: { not: null } },
      select: { contentId: true }
    })
    const idsToReset = titlesHavingNextDate.filter((t) => !allContentIds.has(t.contentId)).map((t) => t.contentId)
    let resetCount = 0
    for (let i = 0; i < idsToReset.length; i += D1_VARIABLE_LIMIT) {
      const chunk = idsToReset.slice(i, i + D1_VARIABLE_LIMIT)
      const { count } = await this.prisma.anime.updateMany({
        where: { contentId: { in: chunk } },
        data: { nextEpisodeDate: null }
      })
      resetCount += count
    }
    if (resetCount > 0) {
      logger.info({
        context: 'fetch',
        action: 'reset-next-episode-date',
        provider: provider.name,
        count: resetCount
      })
    }

    // バッチで AniList 識別し、識別済みの新規タイトルを DB に INSERT
    const BATCH_SIZE = 20
    const identifiedContentIds: string[] = []

    for (let i = 0; i < newTitles.length; i += BATCH_SIZE) {
      const batch = newTitles.slice(i, i + BATCH_SIZE)
      const results = await adapter.identifyBatch(batch.map((t) => t.title))

      for (let j = 0; j < batch.length; j++) {
        const meta = results[j]
        if (meta) {
          const t = batch[j]
          const nextEpisodeDate = parseFutureDate(t.nextEpisodeDate)
          await this.prisma.anime.create({
            data: {
              provider: provider.name,
              contentId: t.contentId,
              title: meta.title,
              description: t.description,
              entityType: t.entityType,
              maturityRating: t.maturityRating,
              imageUrl: t.imageUrl ?? '',
              benefitId: t.benefitId,
              aniListId: meta.aniListId ?? 0,
              status: meta.status,
              year: meta.year,
              quarter: meta.quarter,
              isIdentified: true,
              nextEpisodeDate
            }
          })
          logger.info({
            context: 'fetch',
            action: 'create-anime',
            provider: provider.name,
            contentId: t.contentId,
            title: meta.title,
            year: meta.year,
            quarter: meta.quarter,
            nextEpisodeDate: nextEpisodeDate ? dayjs(nextEpisodeDate).toISOString() : null
          })
          identifiedContentIds.push(t.contentId)
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

    // browse API から取得できた nextEpisodeDate を既存タイトルに反映
    const titlesWithNextDate = titles.filter((t) => existingIds.has(t.contentId) && t.nextEpisodeDate)
    for (const t of titlesWithNextDate) {
      const nextEpisodeDate = parseFutureDate(t.nextEpisodeDate)
      await this.prisma.anime.update({
        where: { provider_contentId: { provider: provider.name, contentId: t.contentId } },
        data: { nextEpisodeDate }
      })
      logger.info({
        context: 'fetch',
        action: 'update-next-episode-date',
        provider: provider.name,
        contentId: t.contentId,
        nextEpisodeDate: nextEpisodeDate ? dayjs(nextEpisodeDate).toISOString() : null
      })
    }

    // バッジ（新エピソード・新着等）があるタイトルだけを update 対象にする
    const updateTargets = titles.filter((t) => existingIds.has(t.contentId) && t.hasNewContent)
    logger.info({
      context: 'fetch',
      action: 'filter-by-badge',
      provider: provider.name,
      total: existingIds.size,
      withBadge: updateTargets.length
    })

    return [...updateTargets.map((t) => t.contentId), ...identifiedContentIds]
  }

  /** 配信終了間近取得: 既存タイトルの expiredAt / expiringSeason を更新 */
  private async fetchExpiring(providerName: string): Promise<string[]> {
    const provider = getProvider(providerName)
    const titles = await provider.fetchTitleList({ expiringOnly: true })
    const existingIds = await findExistingContentIds(
      this.prisma,
      titles.map((t) => t.contentId)
    )

    // 既存タイトルの expiredAt を更新
    const titlesWithExpiring = titles.filter((t) => existingIds.has(t.contentId) && t.expiring)
    for (const t of titlesWithExpiring) {
      const { expiredAt, expiringSeason } = computeExpiringFields(t)
      await this.prisma.anime.update({
        where: { provider_contentId: { provider: provider.name, contentId: t.contentId } },
        data: { expiredAt, expiringSeason }
      })
    }

    // 配信終了一覧から消えたタイトルの expiredAt をリセット
    const expiringContentIds = new Set(titlesWithExpiring.map((t) => t.contentId))
    const titlesHavingExpiring = await this.prisma.anime.findMany({
      where: { provider: provider.name, expiredAt: { not: null } },
      select: { contentId: true }
    })
    const expiringIdsToReset = titlesHavingExpiring
      .filter((t) => !expiringContentIds.has(t.contentId))
      .map((t) => t.contentId)
    let expiringResetCount = 0
    for (let i = 0; i < expiringIdsToReset.length; i += D1_VARIABLE_LIMIT) {
      const chunk = expiringIdsToReset.slice(i, i + D1_VARIABLE_LIMIT)
      const { count } = await this.prisma.anime.updateMany({
        where: { contentId: { in: chunk } },
        data: { expiredAt: null, expiringSeason: null }
      })
      expiringResetCount += count
    }
    if (expiringResetCount > 0) {
      logger.info({
        context: 'fetch',
        action: 'reset-expiring',
        provider: provider.name,
        count: expiringResetCount
      })
    }
    if (titlesWithExpiring.length > 0) {
      logger.info({
        context: 'fetch',
        action: 'update-expiring',
        provider: provider.name,
        count: titlesWithExpiring.length
      })
    }

    return titlesWithExpiring.map((t) => t.contentId)
  }
}
