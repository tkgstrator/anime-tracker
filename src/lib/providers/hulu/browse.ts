import { PaletteResponseSchema, type VodItem } from '../../../schemas/providers/hulu.dto'

const HULU_BASE = 'https://www.hulu.jp'
const HULU_API_BASE = `${HULU_BASE}/api/v2/palettes`
const HULU_FILTERED_API = `${HULU_BASE}/api/v2/filtered`
const PAGE_SIZE = 50
const RECENTLY_ADDED_SLUG = 'recentlyadded-anime'

export const DECADE_AG: Record<number, string> = {
  2000: 'twenty_hundreds',
  2010: 'twenty_tens',
  2020: 'twenty_twenties'
}

const SEASON_SLUG_PREFIX: Record<string, string> = {
  winter: 'january-march-quarter-anime',
  spring: 'april-june-quarter-anime',
  summer: 'july-september-quarter-anime',
  autumn: 'october-december-quarter-anime'
}

/**
 * シーズンと年からHulu のパレット API 用スラッグを生成する。
 */
export function buildSlug(season: string, year: number): string {
  const suffix = String(year).slice(-2)
  return `${SEASON_SLUG_PREFIX[season]}${suffix}`
}

/**
 * Hulu Palette API からページネーション付きでアニメ一覧を再帰的に取得する。
 * @param slug - パレットスラッグ
 * @param from - 取得開始位置
 * @param items - これまでに取得済みのアイテム
 * @returns 全アイテム
 */
async function fetchHuluAnimePage(slug: string, from: number, items: VodItem[]): Promise<VodItem[]> {
  const to = from + PAGE_SIZE - 1
  const url = `${HULU_API_BASE}/${slug}/vod/objects?from=${from}&to=${to}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Hulu API error: ${res.status} ${res.statusText} (${url})`)
  }
  const parsed = PaletteResponseSchema.parse(await res.json())
  const accumulated = [...items, ...parsed.data]
  if (accumulated.length >= parsed.total_count) return accumulated
  return fetchHuluAnimePage(slug, from + PAGE_SIZE, accumulated)
}

/**
 * Hulu Filtered API からページネーション付きで年代別アニメを再帰的に取得する。
 * @param ag - 年代キー (例: "twenty_twenties")
 * @param from - 取得開始位置
 * @param items - これまでに取得済みのアイテム
 * @returns 全アイテム
 */
async function fetchHuluFilteredPage(ag: string, from: number, items: VodItem[]): Promise<VodItem[]> {
  const to = from + PAGE_SIZE - 1
  const params = new URLSearchParams([
    ['id', `ag:${ag}`],
    ['id', 'gft:and'],
    ['id', 'edg:tv_animation'],
    ['sort', '[{"values.weekly_uu":"desc"}]'],
    ['service', 'mixed'],
    ['from', String(from)],
    ['to', String(to)]
  ])
  const url = `${HULU_FILTERED_API}?${params}`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Hulu filtered API error: ${res.status} ${res.statusText} (${url})`)
  }
  const parsed = PaletteResponseSchema.parse(await res.json())
  const accumulated = [...items, ...parsed.data]
  if (accumulated.length >= parsed.total_count) return accumulated
  return fetchHuluFilteredPage(ag, from + PAGE_SIZE, accumulated)
}

/**
 * 指定年代のアニメ一覧を取得する。
 * @param decade - 年代 ("2000", "2010", "2020")
 * @returns アニメアイテム一覧
 * @throws 不明な年代の場合
 */
export async function fetchHuluAnimeByDecade(decade: number): Promise<VodItem[]> {
  const ag = DECADE_AG[decade]
  if (!ag) throw new Error(`Unknown decade: ${decade}. Valid values: ${Object.keys(DECADE_AG).join(', ')}`)
  return fetchHuluFilteredPage(ag, 0, [])
}

/**
 * 最近追加されたアニメの VodItem 一覧を取得する。
 *
 * `recentlyadded-anime` パレット API から直接取得し、
 * エピソード単位のエントリは series_id で重複排除する。
 * @returns 最近追加されたアニメの VodItem 一覧（シリーズ単位で重複排除済み）
 */
export async function fetchRecentlyAdded(): Promise<VodItem[]> {
  return fetchHuluAnimePage(RECENTLY_ADDED_SLUG, 0, [])
}

const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const

/**
 * 現在の日付から今期（＋最終月なら来期も）のパレットスラッグを返す。
 *
 * 各四半期の最終月（3月, 6月, 9月, 12月）は来期のパレットも含める。
 * 12月の来期は翌年の冬になる。
 */
export function currentSeasonSlugs(now = new Date()): string[] {
  const month = now.getMonth() // 0-based
  const year = now.getFullYear()
  const quarterIndex = Math.floor(month / 3) // 0=winter, 1=spring, 2=summer, 3=autumn
  const slugs = [buildSlug(SEASONS[quarterIndex], year)]

  const isLastMonthOfQuarter = month % 3 === 2
  if (isLastMonthOfQuarter) {
    const nextQuarterIndex = (quarterIndex + 1) % 4
    const nextYear = quarterIndex === 3 ? year + 1 : year
    slugs.push(buildSlug(SEASONS[nextQuarterIndex], nextYear))
  }

  return slugs
}

/**
 * 今期（＋最終月なら来期も）のアニメ一覧をパレット API から取得する。
 * slug 間で重複するタイトルは除外する。
 */
export async function fetchCurrentSeasonAnime(): Promise<VodItem[]> {
  const slugs = currentSeasonSlugs()
  const results = await Promise.all(
    slugs.map((slug) => fetchHuluAnimePage(slug, 0, []).catch(() => [] as VodItem[]))
  )
  const seen = new Set<string>()
  const items: VodItem[] = []
  for (const item of results.flat()) {
    if (seen.has(item.slug)) continue
    seen.add(item.slug)
    items.push(item)
  }
  return items
}
