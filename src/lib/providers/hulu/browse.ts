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
 * 最近追加されたアニメの id_in_schema 一覧を取得する。
 *
 * エピソード単位のエントリは `additionalInfo.series_id` を、
 * シリーズ単位のエントリは `additionalInfo.id_in_schema` を収集する。
 * `fetchTitleList` 側の `id_in_schema` と突き合わせて新エピソード判定に使う。
 * @returns 最近追加されたシリーズの id_in_schema の Set
 */
export async function fetchRecentlyAddedIds(): Promise<Set<number>> {
  const items = await fetchHuluAnimePage(RECENTLY_ADDED_SLUG, 0, [])
  const ids = new Set<number>()
  for (const item of items) {
    const seriesId = item.additionalInfo.series_id
    if (seriesId) ids.add(seriesId)
  }
  return ids
}
