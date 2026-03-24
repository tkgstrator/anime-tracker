import dayjs from 'dayjs'
import type { TitleMetadata } from '../../schemas/providers/metadata.dto'
import { MetadataAdapter } from './base'

const TMDB_BASE = 'https://api.themoviedb.org/3'
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

async function searchTmdbTv(title: string, apiKey: string): Promise<TmdbSearchResult | undefined> {
  const data = await tmdbFetch<{ results: TmdbSearchResult[] }>('/search/tv', apiKey, { query: title })
  return data.results[0]
}

interface TmdbIdentifyDetail {
  id: number
  name: string
  status: string
  first_air_date: string | null
}

/**
 * タイトルをTMDBで検索し、見つかった場合は詳細APIでstatus等を取得して返す。
 * search → detail の2段階。
 */
async function identifyTmdbTv(title: string, apiKey: string): Promise<TmdbIdentifyDetail | undefined> {
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
