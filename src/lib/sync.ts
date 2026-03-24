import type { PrismaClient } from '../generated/prisma/client.ts'
import type { ProviderTitleDetail } from '../schemas/provider.dto'
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

    let offset = 0
    for (const dbSeason of dbSeasons) {
      const dbEpisodes = dbSeason.episodes
      for (const dbEp of dbEpisodes) {
        const providerEp = providerEpisodesFlat[offset + dbEp.episodeNumber - 1]
        if (!providerEp || dbEp.episodeId) {
          continue
        }
        await prisma.episode.update({
          where: { id: dbEp.id },
          data: { episodeId: providerEp.episodeId }
        })
      }
      offset += dbEpisodes.length
    }
  }
}
