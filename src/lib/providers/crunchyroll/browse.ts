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
    nextEpisodeDate: null,
    badge: badge ?? (item.new ? 'RECENTLY_ADDED' : null)
  }
}

/**
 * Browse API でページネーション付きの全取得を行う。
 * @param sortBy - ソート順 ("newly_added" | "alphabetical" | "popularity")
 * @param maxItems - 最大取得数 (0 = 無制限)
 */
async function fetchBrowsePage(
  sortBy: string,
  start: number,
  total: number,
  maxItems: number,
  items: BrowseItem[]
): Promise<BrowseItem[]> {
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
  const resolvedTotal = start === 0 ? result.data.total : total
  const accumulated = [...items, ...result.data.data]

  if (result.data.data.length === 0) return accumulated
  if (accumulated.length >= resolvedTotal) return accumulated
  if (maxItems > 0 && accumulated.length >= maxItems) return accumulated
  return fetchBrowsePage(sortBy, start + PAGE_SIZE, resolvedTotal, maxItems, accumulated)
}

export async function fetchBrowse(sortBy: string, maxItems = 0): Promise<BrowseItem[]> {
  const items = await fetchBrowsePage(sortBy, 0, Number.MAX_SAFE_INTEGER, maxItems, [])
  return maxItems > 0 ? items.slice(0, maxItems) : items
}
