import type { ProviderEpisode, ProviderSeason, ProviderTitleDetail } from '../schemas/provider.dto'

/**
 * TMDBのシーズン・エピソード構造をベースに、
 * 複数プロバイダのエピソード情報（episodeId等）をマージする。
 *
 * TMDBが正規のエピソード構造を持ち、各プロバイダはepisodeIdや
 * メタデータ（description, imageUrl等）を補完する。
 *
 * プロバイダのシーズン構造がTMDBと異なる場合（例: プロバイダが
 * 全話を1シーズンにまとめている場合）は、通しエピソード番号で
 * マッチングする。
 */

export interface MergedEpisode {
  episodeNumber: number
  title: string
  description: string
  releaseDate: string
  duration: number
  imageUrl: string
  providers: Record<
    string,
    {
      episodeId: string
      benefitId: string | null
      hasSubtitles: boolean
      hasDub: boolean
      maturityRating: number | null
      imageUrl: string
      description: string
      releaseDate: string
      duration: number
    }
  >
}

export interface MergedSeason {
  seasonNumber: number
  displayName: string
  imageUrl: string | null
  episodes: MergedEpisode[]
}

export interface MergedTitle {
  title: string
  description: string
  entityType: 'tv' | 'movie'
  seasons: MergedSeason[]
}

export interface TmdbSeasonData {
  seasonNumber: number
  displayName: string
  imageUrl: string | null
  episodes: {
    episodeNumber: number
    title: string
    description: string
    releaseDate: string
    duration: number
    imageUrl: string
  }[]
}

export interface TmdbTitleData {
  title: string
  description: string
  seasons: TmdbSeasonData[]
}

interface ProviderInput {
  provider: string
  detail: ProviderTitleDetail
}

/**
 * プロバイダのエピソードをTMDBシーズン構造にマッチングする。
 *
 * 1. シーズン数が一致 → seasonNumberで直接マッチ
 * 2. シーズン数が不一致 → 全エピソードをフラットにし、通し番号でマッチ
 */
function matchProviderEpisodes(
  tmdbSeasons: TmdbSeasonData[],
  providerSeasons: ProviderSeason[]
): Map<string, ProviderEpisode> {
  const result = new Map<string, ProviderEpisode>()

  const tmdbSeasonNumbers = new Set(tmdbSeasons.map((s) => s.seasonNumber))
  const providerSeasonNumbers = new Set(providerSeasons.map((s) => s.seasonNumber))
  const seasonsMatch =
    tmdbSeasonNumbers.size === providerSeasonNumbers.size &&
    [...tmdbSeasonNumbers].every((n) => providerSeasonNumbers.has(n))

  if (seasonsMatch) {
    for (const providerSeason of providerSeasons) {
      for (const ep of providerSeason.episodes) {
        const key = `${providerSeason.seasonNumber}:${ep.episodeNumber}`
        result.set(key, ep)
      }
    }
  } else {
    // フラットにして通し番号でマッチ
    const providerFlat = providerSeasons
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .flatMap((s) => [...s.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber))

    let flatIndex = 0
    for (const tmdbSeason of [...tmdbSeasons].sort((a, b) => a.seasonNumber - b.seasonNumber)) {
      for (const tmdbEp of tmdbSeason.episodes) {
        if (flatIndex < providerFlat.length) {
          const key = `${tmdbSeason.seasonNumber}:${tmdbEp.episodeNumber}`
          result.set(key, providerFlat[flatIndex])
          flatIndex++
        }
      }
    }
  }

  return result
}

/**
 * TMDBをベースに複数プロバイダのデータをマージする。
 *
 * - TMDBのシーズン・エピソード構造が正規
 * - 各プロバイダからepisodeId, benefitId等のメタデータを補完
 * - プロバイダのエピソード情報（description, imageUrl等）はTMDBが空の場合に使用
 */
export function mergeTitle(tmdb: TmdbTitleData, providers: ProviderInput[]): MergedTitle {
  const providerMaps = providers.map(({ provider, detail }) => ({
    provider,
    episodes: matchProviderEpisodes(tmdb.seasons, detail.seasons)
  }))

  const seasons: MergedSeason[] = tmdb.seasons.map((tmdbSeason) => {
    const episodes: MergedEpisode[] = tmdbSeason.episodes.map((tmdbEp) => {
      const key = `${tmdbSeason.seasonNumber}:${tmdbEp.episodeNumber}`

      const providerData: MergedEpisode['providers'] = {}
      for (const { provider, episodes: epMap } of providerMaps) {
        const providerEp = epMap.get(key)
        if (providerEp) {
          providerData[provider] = {
            episodeId: providerEp.episodeId,
            benefitId: providerEp.benefitId,
            hasSubtitles: providerEp.hasSubtitles,
            hasDub: providerEp.hasDub,
            maturityRating: providerEp.maturityRating,
            imageUrl: providerEp.imageUrl,
            description: providerEp.description,
            releaseDate: providerEp.releaseDate,
            duration: providerEp.duration
          }
        }
      }

      // TMDBの情報を優先、空ならプロバイダから補完
      const firstProvider = Object.values(providerData)[0]
      return {
        episodeNumber: tmdbEp.episodeNumber,
        title: tmdbEp.title || firstProvider?.description?.slice(0, 50) || `第${tmdbEp.episodeNumber}話`,
        description: tmdbEp.description || firstProvider?.description || '',
        releaseDate: tmdbEp.releaseDate || firstProvider?.releaseDate || '',
        duration: tmdbEp.duration || firstProvider?.duration || 0,
        imageUrl: tmdbEp.imageUrl || firstProvider?.imageUrl || '',
        providers: providerData
      }
    })

    return {
      seasonNumber: tmdbSeason.seasonNumber,
      displayName: tmdbSeason.displayName,
      imageUrl: tmdbSeason.imageUrl,
      episodes
    }
  })

  return {
    title: tmdb.title,
    description: tmdb.description,
    entityType: 'tv',
    seasons
  }
}
