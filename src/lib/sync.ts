import dayjs from 'dayjs'
import type { ExpiringResponse, TitleListResponse } from '@/schemas/lambda.dto.ts'
import type { FetchMessage, UpdateMessage } from '@/schemas/message.dto.ts'
import type { Episode, Season, TitleInfo } from '@/schemas/providers/common.dto.ts'
import type { PrismaClient } from '../generated/prisma/client.ts'
import type { FetchClient } from './lambda'
import { getAppLogger } from './logger'
import { AniListAdapter, cleanTitle } from './metadata/anilist'

const adapter = new AniListAdapter()

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Error && 'code' in e && (e as { code: string }).code === 'P2002'
}

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

/** ISO 8601 文字列を Date に変換し、過去なら null を返す */
function parseFutureDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null
  const d = dayjs(dateStr)
  return d.isAfter(dayjs()) ? d.toDate() : null
}

const syncLogger = getAppLogger('sync')
const fetchLogger = getAppLogger('fetch')

export class SyncService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly lambda: FetchClient
  ) {}

  /** プロバイダのエピソード情報を取得し、不足しているシーズン・エピソードを同期する */
  async update({ message }: UpdateMessage): Promise<void> {
    syncLogger.debug({
      action: 'update-start',
      provider: message.provider,
      contentId: message.contentId
    })

    // Lambda 経由で取得（画像の R2 アップロードも Lambda 側で実行される）
    const detail = await this.lambda.fetchTitleInfo({ provider: message.provider, contentId: message.contentId })
    await this.applyDetail(message.provider, message.contentId, detail)
  }

  /** 取得済みの TitleInfo を DB に反映する（Lambda 不要） */
  async applyDetail(provider: string, contentId: string, detail: TitleInfo): Promise<void> {
    syncLogger.debug({
      action: 'apply-detail',
      provider,
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length,
      episodeCount: detail.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
    })

    const anime = await this.prisma.anime.update({
      where: { provider_contentId: { provider, contentId } },
      data: { description: detail.description }
    })

    await this.syncSeasons(anime.id, provider, contentId, detail.seasons)

    syncLogger.info({
      action: 'update',
      provider,
      contentId
    })
  }

  /** 既存シーズン・エピソードと差分比較し、不足分を追加する */
  private async syncSeasons(animeId: string, provider: string, contentId: string, seasons: Season[]): Promise<void> {
    const anime = await this.prisma.anime.findUniqueOrThrow({
      where: { provider_contentId: { provider, contentId } },
      include: {
        seasons: {
          include: { episodes: { select: { id: true, episodeNumber: true, imageUrl: true } } }
        }
      }
    })

    const existingSeasons = new Map(
      anime.seasons.map((s) => [
        s.seasonNumber,
        new Map(s.episodes.map((e) => [e.episodeNumber, { id: e.id, imageUrl: e.imageUrl }]))
      ])
    )

    for (const season of seasons) {
      const existingEpisodes = existingSeasons.get(season.seasonNumber)

      if (!existingEpisodes) {
        try {
          await this.createSeason(animeId, season)
          syncLogger.info({
            action: 'create-season',
            provider,
            contentId,
            seasonNumber: season.seasonNumber,
            displayName: season.displayName,
            episodeCount: season.episodes.length
          })
        } catch (e) {
          if (!isUniqueConstraintError(e)) throw e
          syncLogger.warn({ action: 'create-season-duplicate', provider, contentId, seasonId: season.seasonId })
        }
        continue
      }

      const dbSeason = anime.seasons.find((s) => s.seasonNumber === season.seasonNumber)
      if (!dbSeason) continue

      for (const episode of season.episodes) {
        const existing = existingEpisodes.get(episode.episodeNumber)
        if (!existing) {
          try {
            await this.createEpisode(dbSeason.id, episode)
          } catch (e) {
            if (!isUniqueConstraintError(e)) throw e
          }
          continue
        }
        if (existing.imageUrl !== episode.imageUrl) {
          await this.prisma.episode.update({
            where: { id: existing.id },
            data: {
              imageUrl: episode.imageUrl,
              description: episode.description,
              duration: episode.duration
            }
          })
        }
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
        releaseDate: dayjs(episode.releaseDate).toDate(),
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
  async fetch({ message }: FetchMessage, result: ExpiringResponse | TitleListResponse): Promise<string[]> {
    fetchLogger.info({
      action: 'fetch-start',
      provider: message.provider,
      category: message.category
    })
    if (message.category === 'expiring') {
      return this.fetchExpiring(message.provider, result as ExpiringResponse)
    }
    return this.fetchTitleList(message.provider, message.category, result as TitleListResponse)
  }

  /** 新着エピソード / 最近更新取得: Lambda レスポンス → AniList 識別 + DB INSERT + nextEpisodeDate 更新 */
  private async fetchTitleList(providerName: string, category: string, result: TitleListResponse): Promise<string[]> {
    // new_episode の場合、COMING_SOON タイトル（nextEpisodeDate あり）を除外して上書きを防ぐ
    const comingSoonContentIds =
      category === 'new_episode'
        ? new Set(result.entries.filter((t) => t.badge === 'COMING_SOON').map((t) => t.contentId))
        : new Set<string>()
    const titles = result.entries.filter((t) => !comingSoonContentIds.has(t.contentId))

    if (comingSoonContentIds.size > 0) {
      fetchLogger.info({
        action: 'skip-coming-soon',
        provider: providerName,
        count: comingSoonContentIds.size
      })
    }

    const existingIds = await findExistingContentIds(
      this.prisma,
      titles.map((t) => t.contentId)
    )
    const newTitles = titles.filter((t) => !existingIds.has(t.contentId))
    fetchLogger.info({
      action: 'check-titles',
      provider: providerName,
      total: titles.length,
      existing: existingIds.size,
      new: newTitles.length
    })

    // このカテゴリに対応するバッジを持つタイトルのうち、今回の取得結果に含まれないものをリセット
    const badgesForCategory: Record<string, string[]> = {
      new_episode: ['NEW_EPISODE', 'RECENTLY_ADDED'],
      coming_soon: ['COMING_SOON']
    }
    const targetBadges = badgesForCategory[category] ?? []
    const allContentIds = new Set(titles.map((t) => t.contentId))

    if (targetBadges.length > 0) {
      const titlesHavingBadge = await this.prisma.anime.findMany({
        where: { provider: providerName, badge: { in: targetBadges } },
        select: { contentId: true }
      })
      const idsToReset = titlesHavingBadge.filter((t) => !allContentIds.has(t.contentId)).map((t) => t.contentId)
      let resetCount = 0
      for (let i = 0; i < idsToReset.length; i += D1_VARIABLE_LIMIT) {
        const chunk = idsToReset.slice(i, i + D1_VARIABLE_LIMIT)
        const { count } = await this.prisma.anime.updateMany({
          where: { contentId: { in: chunk } },
          data: { badge: null, nextEpisodeDate: null }
        })
        resetCount += count
      }
      if (resetCount > 0) {
        fetchLogger.info({
          action: 'reset-badge',
          provider: providerName,
          category,
          badges: targetBadges,
          count: resetCount
        })
      }
    }

    // バッチで AniList 識別し、識別済みの新規タイトルを DB に INSERT
    const BATCH_SIZE = 20
    const identifiedContentIds: string[] = []

    for (let i = 0; i < newTitles.length; i += BATCH_SIZE) {
      const batch = newTitles.slice(i, i + BATCH_SIZE)
      fetchLogger.debug({
        action: 'identify-batch',
        provider: providerName,
        batchIndex: Math.floor(i / BATCH_SIZE),
        batchSize: batch.length,
        titles: batch.map((t) => t.title)
      })
      const results = await adapter.identifyBatch(
        batch.map((t) => t.title),
        this.lambda
      )

      for (let j = 0; j < batch.length; j++) {
        const meta = results[j]
        if (meta) {
          const t = batch[j]
          const nextEpisodeDate = parseFutureDate(t.nextEpisodeDate)
          await this.prisma.anime.create({
            data: {
              provider: providerName,
              contentId: t.contentId,
              title: meta.title,
              description: t.description,
              entityType: t.entityType,
              maturityRating: t.maturityRating,
              imageUrl: t.imageUrl ?? '',
              aniListId: meta.aniListId ?? 0,
              status: meta.status,
              year: meta.year,
              quarter: meta.quarter,
              isIdentified: true,
              badge: t.badge,
              nextEpisodeDate
            }
          })
          fetchLogger.info({
            action: 'create-anime',
            provider: providerName,
            contentId: t.contentId,
            title: meta.title,
            year: meta.year,
            quarter: meta.quarter,
            nextEpisodeDate: nextEpisodeDate ? dayjs(nextEpisodeDate).toISOString() : null
          })
          identifiedContentIds.push(t.contentId)
        } else {
          syncLogger.warn({
            action: 'unidentified',
            provider: providerName,
            title: batch[j].title,
            search: cleanTitle(batch[j].title),
            contentId: batch[j].contentId
          })
        }
      }
    }

    // 既存タイトルの badge / nextEpisodeDate を更新
    const existingTitles = titles.filter((t) => existingIds.has(t.contentId))
    for (const t of existingTitles) {
      const nextEpisodeDate = parseFutureDate(t.nextEpisodeDate)
      await this.prisma.anime.update({
        where: { provider_contentId: { provider: providerName, contentId: t.contentId } },
        data: { badge: t.badge, nextEpisodeDate }
      })
    }
    if (existingTitles.length > 0) {
      fetchLogger.debug({
        action: 'update-badge-and-dates',
        provider: providerName,
        count: existingTitles.length
      })
    }

    // バッジ付きタイトルだけを update 対象にする
    const updateTargets = titles.filter((t) => existingIds.has(t.contentId) && t.badge)
    fetchLogger.info({
      action: 'filter-by-badge',
      provider: providerName,
      total: existingIds.size,
      withBadge: updateTargets.length
    })

    fetchLogger.info({
      action: 'fetch-title-list-done',
      provider: providerName,
      identified: identifiedContentIds.length,
      updateTargets: updateTargets.length
    })

    return [...updateTargets.map((t) => t.contentId), ...identifiedContentIds]
  }

  /** 配信終了間近取得: Lambda レスポンスの expiredAt データで DB を更新 */
  private async fetchExpiring(providerName: string, result: ExpiringResponse): Promise<string[]> {
    const { fetchedAt, entries } = result

    fetchLogger.info({
      action: 'expiring-cache-loaded',
      provider: providerName,
      fetchedAt,
      count: entries.length
    })

    const existingIds = await findExistingContentIds(
      this.prisma,
      entries.map((e) => e.contentId)
    )

    const targets = entries.filter((e) => existingIds.has(e.contentId))

    fetchLogger.debug({
      action: 'expiring-titles-fetched',
      provider: providerName,
      total: entries.length,
      existing: existingIds.size,
      targets: targets.length
    })

    for (const e of targets) {
      await this.prisma.anime.update({
        where: { provider_contentId: { provider: providerName, contentId: e.contentId } },
        data: { badge: 'EXPIRING', expiredAt: dayjs(e.expiredAt).toDate(), expiringSeason: e.expiringSeason }
      })
      fetchLogger.debug({
        action: 'update-expiring-title',
        provider: providerName,
        contentId: e.contentId,
        expiredAt: e.expiredAt,
        expiringSeason: e.expiringSeason
      })
    }

    // 配信終了一覧から消えたタイトルの expiredAt をリセット
    const expiringContentIds = new Set(targets.map((e) => e.contentId))
    const titlesHavingExpiring = await this.prisma.anime.findMany({
      where: { provider: providerName, expiredAt: { not: null } },
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
        data: { badge: null, expiredAt: null, expiringSeason: null }
      })
      expiringResetCount += count
    }
    if (expiringResetCount > 0) {
      fetchLogger.info({
        action: 'reset-expiring',
        provider: providerName,
        count: expiringResetCount
      })
    }
    if (targets.length > 0) {
      fetchLogger.info({
        action: 'update-expiring',
        provider: providerName,
        count: targets.length
      })
    }

    return targets.map((e) => e.contentId)
  }
}
