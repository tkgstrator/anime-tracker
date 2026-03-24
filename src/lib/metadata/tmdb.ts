import dayjs from 'dayjs'
import type { TitleMetadata } from '../../schemas/provider.dto'
import { logger } from '../logger'
import { MetadataAdapter } from './base'

const TMDB_BASE = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500'

interface TmdbSearchResult {
  id: number
  name: string
  original_name: string
  first_air_date?: string
}

interface TmdbTvDetail {
  id: number
  name: string
  original_name: string
  overview: string
  status: string
  first_air_date: string | null
  number_of_seasons: number
  seasons: {
    season_number: number
    name: string
    episode_count: number
    air_date: string | null
    poster_path: string | null
  }[]
}

interface TmdbEpisode {
  episode_number: number
  name: string
  overview: string
  air_date: string | null
  runtime: number | null
  still_path: string | null
}

interface TmdbSeasonDetail {
  episodes: TmdbEpisode[]
}

export interface TmdbSyncResult {
  tmdbId: number
  seasons: number
  episodes: number
}

async function tmdbFetch<T>(path: string, apiKey: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${TMDB_BASE}${path}`)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('language', 'ja-JP')
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString())
  if (!res.ok) throw new Error(`TMDB API error: ${res.status} ${res.statusText}`)
  return res.json() as Promise<T>
}

export async function searchTmdbTv(title: string, apiKey: string): Promise<TmdbSearchResult | undefined> {
  const data = await tmdbFetch<{ results: TmdbSearchResult[] }>('/search/tv', apiKey, { query: title })
  return data.results[0]
}

export interface TmdbIdentifyDetail {
  id: number
  name: string
  status: string
  first_air_date: string | null
}

/**
 * タイトルをTMDBで検索し、見つかった場合は詳細APIでstatus等を取得して返す。
 * search → detail の2段階。
 */
export async function identifyTmdbTv(title: string, apiKey: string): Promise<TmdbIdentifyDetail | undefined> {
  const searchResult = await searchTmdbTv(title, apiKey)
  if (!searchResult) return undefined
  const detail = await tmdbFetch<TmdbTvDetail>(`/tv/${searchResult.id}`, apiKey)
  return {
    id: detail.id,
    name: detail.name,
    status: detail.status,
    first_air_date: detail.first_air_date
  }
}

export interface TmdbIdentifyResult {
  id: string
  found: boolean
  tmdbId?: number
}

/**
 * 複数タイトルを並列でTMDB検索し、tmdbIdを返す
 * chunkSize件ずつPromise.allで並列実行
 */
export async function identifyTmdbChunk(
  targets: { id: string; title: string }[],
  apiKey: string,
  chunkSize = 50
): Promise<TmdbIdentifyResult[]> {
  const results: TmdbIdentifyResult[] = []

  for (let i = 0; i < targets.length; i += chunkSize) {
    const chunk = targets.slice(i, i + chunkSize)
    const chunkResults = await Promise.all(
      chunk.map(async (target) => {
        try {
          const result = await searchTmdbTv(target.title, apiKey)
          return {
            id: target.id,
            found: !!result,
            tmdbId: result?.id
          }
        } catch {
          return { id: target.id, found: false }
        }
      })
    )
    results.push(...chunkResults)
    logger.info({ context: 'tmdb-identify', action: 'chunk-done', offset: i, chunkSize: chunk.length, total: targets.length })
  }

  return results
}

export async function fetchTmdbEpisodes(
  tmdbId: number,
  apiKey: string
): Promise<{
  title: string
  description: string
  status: string
  seasons: {
    seasonId: string
    displayName: string
    seasonNumber: number
    imageUrl: string | null
    year: number | null
    quarter: number | null
    episodes: {
      episodeNumber: number
      title: string
      description: string
      releaseDate: string
      duration: number
      imageUrl: string
    }[]
  }[]
}> {
  const tv = await tmdbFetch<TmdbTvDetail>(`/tv/${tmdbId}`, apiKey)

  const seasonNumbers = tv.seasons.filter((s) => s.season_number > 0 && s.episode_count > 0).map((s) => s.season_number)

  const seasonDetails = await Promise.all(
    seasonNumbers.map((n) => tmdbFetch<TmdbSeasonDetail>(`/tv/${tmdbId}/season/${n}`, apiKey))
  )

  const seasons = tv.seasons
    .filter((s) => s.season_number > 0 && s.episode_count > 0)
    .map((s, i) => {
      const airDate = s.air_date ? dayjs(s.air_date) : null
      const year = airDate ? airDate.year() : null
      const quarter = airDate ? Math.floor(airDate.month() / 3) : null
      return {
        seasonId: String(s.season_number),
        displayName: s.name,
        seasonNumber: s.season_number,
        imageUrl: s.poster_path ? `${TMDB_IMAGE_BASE}${s.poster_path}` : null,
        year,
        quarter,
        episodes: seasonDetails[i].episodes.map((ep) => ({
          episodeNumber: ep.episode_number,
          title: ep.name,
          description: ep.overview ?? '',
          releaseDate: ep.air_date ?? '',
          duration: ep.runtime ?? 0,
          imageUrl: ep.still_path ? `${TMDB_IMAGE_BASE}${ep.still_path}` : ''
        }))
      }
    })

  return { title: tv.name || '', description: tv.overview || '', status: tv.status, seasons }
}

function parseYear(dateStr?: string | null): number | undefined {
  if (!dateStr) return undefined
  const d = dayjs(dateStr)
  return d.isValid() ? d.year() : undefined
}

const TMDB_STATUS_MAP: Record<string, TitleMetadata['status']> = {
  'Returning Series': 'RELEASING',
  Ended: 'FINISHED',
  Canceled: 'CANCELLED',
  'In Production': 'NOT_YET_RELEASED',
  Planned: 'NOT_YET_RELEASED'
}

function mapTmdbStatus(raw: string): TitleMetadata['status'] {
  return TMDB_STATUS_MAP[raw] ?? 'UNKNOWN'
}

export class TmdbAdapter extends MetadataAdapter {
  readonly name = 'tmdb'

  constructor(private readonly apiKey: string) {
    super()
  }

  async identify(rawTitle: string): Promise<TitleMetadata | undefined> {
    const result = await identifyTmdbTv(rawTitle, this.apiKey)
    if (!result) return undefined
    return {
      tmdbId: result.id,
      title: result.name,
      status: mapTmdbStatus(result.status),
      year: parseYear(result.first_air_date) ?? 0,
      quarter: 0
    }
  }
}
