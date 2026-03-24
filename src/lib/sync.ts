import type { PrismaClient } from '../generated/prisma/client.ts'
import type { ProviderTitle, ProviderTitleDetail } from '../schemas/provider.dto'
import { searchAniList } from './anilist'
import { AmazonProvider } from './providers/amazon'
import type { Provider } from './providers/base'
import { HuluProvider } from './providers/hulu'
import { fetchTmdbEpisodes, searchTmdbTv, type TmdbSyncResult } from './tmdb'

const providers: Record<string, Provider> = {
  amazon: new AmazonProvider(),
  hulu: new HuluProvider()
}

/**
 * プロバイダ名からプロバイダインスタンスを取得する。
 * @param name - プロバイダ名 (例: "amazon", "hulu")
 * @returns プロバイダインスタンス
 * @throws 不明なプロバイダ名の場合
 */
export function getProvider(name: string): Provider {
  const provider = providers[name]
  if (!provider) throw new Error(`Unknown provider: ${name}`)
  return provider
}

/**
 * プロバイダからタイトル詳細を取得する。
 * @param provider - プロバイダ名
 * @param contentId - コンテンツ ID
 * @returns タイトル詳細情報
 */
export async function fetchDetail(provider: string, contentId: string): Promise<ProviderTitleDetail> {
  return getProvider(provider).fetchEpisodeList(contentId)
}

export async function syncTitle(
  prisma: PrismaClient,
  provider: string,
  contentId: string,
  detail: ProviderTitleDetail
): Promise<void> {
  const anime = await prisma.anime.upsert({
    where: { provider_contentId: { provider, contentId } },
    create: {
      title: detail.title,
      description: detail.description,
      provider,
      contentId,
      entityType: detail.entityType,
      maturityRating: detail.maturityRating,
      imageUrl: detail.imageUrl,
      benefitId: detail.benefitId,
      year: 0,
      quarter: 0
    },
    update: {
      description: detail.description,
      entityType: detail.entityType,
      maturityRating: detail.maturityRating,
      benefitId: detail.benefitId
    }
  })

  for (const s of detail.seasons) {
    const season = await prisma.season.upsert({
      where: { animeId_seasonId: { animeId: anime.id, seasonId: s.seasonId } },
      create: {
        animeId: anime.id,
        seasonId: s.seasonId,
        displayName: s.displayName,
        seasonNumber: s.seasonNumber,
        imageUrl: s.imageUrl
      },
      update: {
        displayName: s.displayName,
        seasonNumber: s.seasonNumber,
        imageUrl: s.imageUrl
      }
    })

    for (const ep of s.episodes) {
      await prisma.episode.upsert({
        where: { seasonId_episodeNumber: { seasonId: season.id, episodeNumber: ep.episodeNumber } },
        create: {
          seasonId: season.id,
          episodeNumber: ep.episodeNumber,
          episodeId: ep.episodeId,
          title: ep.title,
          description: ep.description,
          releaseDate: ep.releaseDate,
          duration: ep.duration,
          maturityRating: ep.maturityRating,
          imageUrl: ep.imageUrl,
          hasSubtitles: ep.hasSubtitles,
          hasDub: ep.hasDub,
          benefitId: ep.benefitId
        },
        update: {
          episodeId: ep.episodeId,
          title: ep.title,
          description: ep.description,
          releaseDate: ep.releaseDate,
          duration: ep.duration,
          maturityRating: ep.maturityRating,
          imageUrl: ep.imageUrl,
          hasSubtitles: ep.hasSubtitles,
          hasDub: ep.hasDub,
          benefitId: ep.benefitId
        }
      })
    }
  }
}

export async function syncEpisodesFromTmdb(
  prisma: PrismaClient,
  animeId: string,
  title: string,
  tmdbId: number | null,
  apiKey: string
): Promise<TmdbSyncResult> {
  const resolvedTmdbId = tmdbId ?? (await searchTmdbTv(title, apiKey))?.id ?? null
  if (!resolvedTmdbId) throw new Error(`TMDB: "${title}" が見つかりませんでした`)

  if (!tmdbId) {
    await prisma.anime.update({ where: { id: animeId }, data: { tmdbId: resolvedTmdbId } })
  }

  const { seasons } = await fetchTmdbEpisodes(resolvedTmdbId, apiKey)

  for (const s of seasons) {
    const season = await prisma.season.upsert({
      where: { animeId_seasonId: { animeId, seasonId: s.seasonId } },
      create: {
        animeId,
        seasonId: s.seasonId,
        displayName: s.displayName,
        seasonNumber: s.seasonNumber,
        imageUrl: s.imageUrl
      },
      update: {
        displayName: s.displayName,
        seasonNumber: s.seasonNumber,
        imageUrl: s.imageUrl
      }
    })

    for (const ep of s.episodes) {
      const updateData: Record<string, unknown> = {}
      if (ep.title) updateData.title = ep.title
      if (ep.description) updateData.description = ep.description
      if (ep.releaseDate) updateData.releaseDate = ep.releaseDate
      if (ep.duration) updateData.duration = ep.duration

      await prisma.episode.upsert({
        where: { seasonId_episodeNumber: { seasonId: season.id, episodeNumber: ep.episodeNumber } },
        create: {
          seasonId: season.id,
          episodeNumber: ep.episodeNumber,
          episodeId: '',
          title: ep.title || `第${ep.episodeNumber}話`,
          description: ep.description,
          releaseDate: ep.releaseDate,
          duration: ep.duration,
          imageUrl: ep.imageUrl
        },
        update: updateData
      })
    }
  }

  const totalEpisodes = seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  return { tmdbId: resolvedTmdbId, seasons: seasons.length, episodes: totalEpisodes }
}

/**
 * プロバイダの新着タイトルをチェックし、DB に存在しないタイトルを識別・追加、
 * 既存タイトルはエピソードを同期する。
 *
 * 1. fetchTitleList({ newEpisodesOnly: true }) で最近更新のあったタイトル一覧取得
 * 2. DB に slug (contentId) が存在するかチェック → 存在すれば 4 へ
 * 3. TMDB / AniList で検索 → どちらかヒットすれば追加対象
 * 4. エピソード詳細を全件取得し DB に upsert
 */
export async function checkNewEpisodes(
  prisma: PrismaClient,
  providerName: string,
  apiKey: string
): Promise<{ added: number; updated: number; skipped: number }> {
  const provider = getProvider(providerName)
  const titles = await provider.fetchTitleList({ newEpisodesOnly: true })
  console.log(`[${providerName}] ${titles.length} titles with recent updates`)

  // 一括で DB に存在する contentId を取得
  const existingAnime = await prisma.anime.findMany({
    where: {
      provider: providerName,
      contentId: { in: titles.map((t) => t.contentId) }
    },
    select: { contentId: true }
  })
  const existingIds = new Set(existingAnime.map((a) => a.contentId))

  const results = await Promise.allSettled(
    titles.map(async (title) => {
      if (existingIds.has(title.contentId)) {
        // 既存タイトル → エピソード同期のみ
        const detail = await provider.fetchEpisodeList(title.contentId)
        await syncTitle(prisma, providerName, title.contentId, detail)
        console.log(`[${providerName}] updated: ${title.title}`)
        return 'updated' as const
      }

      // 新規タイトル → TMDB / AniList で識別
      const identified = await identifyTitle(title, apiKey)
      if (!identified) {
        console.log(`[${providerName}] skip (unidentified): ${title.title}`)
        return 'skipped' as const
      }

      // エピソード取得 & DB 追加
      const detail = await provider.fetchEpisodeList(title.contentId)
      await syncTitle(prisma, providerName, title.contentId, detail)

      // 識別結果を反映
      await prisma.anime.update({
        where: { provider_contentId: { provider: providerName, contentId: title.contentId } },
        data: {
          tmdbId: identified.tmdbId,
          aniListId: identified.aniListId,
          title: identified.nativeTitle ?? detail.title,
          isIdentified: !!identified.nativeTitle,
          status: identified.status ?? 'UNKNOWN',
          year: identified.year,
          quarter: identified.quarter
        }
      })

      console.log(`[${providerName}] added: ${title.title}`)
      return 'added' as const
    })
  )

  const counts = { added: 0, updated: 0, skipped: 0 }
  for (const r of results) {
    if (r.status === 'rejected') {
      console.error(`[${providerName}] error:`, r.reason)
      counts.skipped++
    } else {
      counts[r.value]++
    }
  }
  return counts
}

/**
 * TMDB と AniList でタイトルを検索し、識別情報を返す。
 * どちらにもヒットしなければ undefined を返す。
 * 値が無いフィールドは undefined となり、Prisma update 時にスキップされる。
 */
async function identifyTitle(
  title: ProviderTitle,
  apiKey: string
): Promise<
  | {
      tmdbId?: number
      aniListId?: number
      nativeTitle?: string
      status?: string
      year?: number
      quarter?: number
    }
  | undefined
> {
  const [tmdbResult, aniListResult] = await Promise.all([
    searchTmdbTv(title.title, apiKey).catch(() => null),
    searchAniList(title.title).catch(() => null)
  ])

  if (!tmdbResult && !aniListResult) return undefined

  return {
    tmdbId: tmdbResult?.id,
    aniListId: aniListResult?.id,
    nativeTitle: aniListResult?.nativeTitle ?? tmdbResult?.name,
    status: aniListResult?.status,
    year: aniListResult?.year,
    quarter: aniListResult?.quarter
  }
}

/**
 * プロバイダからエピソード情報を取得し、episodeId等をDBに反映する
 */
export async function syncProviderEpisodeIds(
  prisma: PrismaClient,
  animeId: string,
  provider: string,
  contentId: string
): Promise<void> {
  const detail = await fetchDetail(provider, contentId)

  const dbSeasons = await prisma.season.findMany({
    where: { animeId },
    orderBy: { seasonNumber: 'asc' },
    include: { episodes: { orderBy: { episodeNumber: 'asc' } } }
  })

  // プロバイダのシーズン数とDB側のシーズン数が一致する場合はそのままマッチ
  // 一致しない場合（例: プロバイダ1シーズン24話 vs DB2シーズン各12話）は
  // プロバイダの通しエピソード番号を累積オフセットでDBシーズンに振り分ける
  const providerSeasonCount = detail.seasons.length
  const dbSeasonCount = dbSeasons.length

  if (providerSeasonCount === dbSeasonCount) {
    // シーズン数一致: seasonNumberで直接マッチ
    for (const providerSeason of detail.seasons) {
      const dbSeason = dbSeasons.find((s) => s.seasonNumber === providerSeason.seasonNumber)
      if (!dbSeason) continue

      for (const providerEp of providerSeason.episodes) {
        const dbEp = dbSeason.episodes.find((e) => e.episodeNumber === providerEp.episodeNumber)
        if (!dbEp || dbEp.episodeId) continue

        await prisma.episode.update({
          where: { id: dbEp.id },
          data: { episodeId: providerEp.episodeId }
        })
      }
    }
  } else {
    // シーズン数不一致: プロバイダの全エピソードをフラットにし、
    // DBシーズンの話数に合わせて累積オフセットで振り分ける
    const providerEpisodesFlat = detail.seasons
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .flatMap((s) => [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber))

    // 各シーズンの先頭オフセットを累積で計算
    const offsets = dbSeasons.map((_, i) => dbSeasons.slice(0, i).reduce((sum, s) => sum + s.episodes.length, 0))

    for (const [i, dbSeason] of dbSeasons.entries()) {
      const offset = offsets[i]
      for (const dbEp of dbSeason.episodes) {
        const providerEp = providerEpisodesFlat[offset + dbEp.episodeNumber - 1]
        if (!providerEp || dbEp.episodeId) continue

        await prisma.episode.update({
          where: { id: dbEp.id },
          data: { episodeId: providerEp.episodeId }
        })
      }
    }
  }
}
