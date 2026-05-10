import type { Title } from '../../../schemas/providers/common.dto'
import { type BrowseItem, BrowseResponseSchema, getBestImageUrl } from '../../../schemas/providers/crunchyroll.dto'
import { getAccessToken } from './auth'

const CR_BASE = 'https://www.crunchyroll.com'
const BROWSE_PATH = '/content/v2/discover/browse'
const PAGE_SIZE = 50

/**
 * Crunchyroll API に GET リクエストを送る。
 * Authorization ヘッダに Anonymous Bearer トークンを自動付与する。
 */
export async function crunchyrollGet(path: string, params: Record<string, string>): Promise<unknown> {
  const token = await getAccessToken()
  const url = new URL(path, CR_BASE)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Language': 'ja-JP'
    }
  })
  if (!res.ok) {
    throw new Error(`Crunchyroll API error: ${res.status} ${res.statusText} (${url.pathname})`)
  }
  return res.json()
}

/** maturity rating 文字列 ("TV-14" 等) を数値に変換する */
function parseMaturityRating(ratings: string[]): number | null {
  for (const r of ratings) {
    const m = r.match(/(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

/** BrowseItem → Title の共通変換 */
export function browseItemToTitle(item: BrowseItem, badge?: Title['badge']): Title {
  const meta = item.series_metadata
  return {
    contentId: item.id,
    title: item.title,
    description: item.description || item.title,
    entityType: item.type === 'movie_listing' ? 'movie' : 'tv',
    imageUrl: getBestImageUrl(item.images) ?? 'https://www.crunchyroll.com/build/assets/img/default-poster.png',
    maturityRating: meta ? parseMaturityRating(meta.maturity_ratings) : null,
    nextEpisodeDate: undefined,
    badge: badge ?? (item.new ? 'RECENTLY_ADDED' : undefined)
  }
}

/**
 * Browse API の 1 ページを取得する。
 * @returns 取得済みアイテムと次の start 位置 (打ち切り時は null)
 */
export async function fetchBrowsePage(
  sortBy: string,
  start: number,
  maxItems: number
): Promise<{ items: BrowseItem[]; total: number; next: number | null }> {
  const raw = await crunchyrollGet(BROWSE_PATH, {
    locale: 'ja-JP',
    preferred_audio_language: 'ja-JP',
    n: String(PAGE_SIZE),
    start: String(start),
    sort_by: sortBy,
    type: 'series'
  })
  const result = BrowseResponseSchema.safeParse(raw)
  if (!result.success) throw result.error
  const total = result.data.total
  const fetchedSoFar = start + result.data.data.length
  const reachedEnd =
    result.data.data.length === 0 || fetchedSoFar >= total || (maxItems > 0 && fetchedSoFar >= maxItems)
  return { items: result.data.data, total, next: reachedEnd ? null : start + PAGE_SIZE }
}

export const CRUNCHYROLL_PAGE_SIZE = PAGE_SIZE
