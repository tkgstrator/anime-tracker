import dayjs from 'dayjs'
import { PaletteResponseSchema, type VodItem } from '../../../schemas/providers/hulu.dto'
import { getAppLogger } from '../../logger'

const logger = getAppLogger('hulu-browse')

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
 * Hulu Filtered API からアニメ全般 (TV + 映画) を取得する。
 * `g:8` (アニメジャンル) のみで絞り込み、`edg:tv_animation` / `mt:*` は使用しない。
 * @param sort - ソート値 (デフォルト: 人気順)
 * @param from - 取得開始位置
 * @param items - これまでに取得済みのアイテム
 * @returns 全アイテム
 */
async function fetchHuluAnimeAllPage(sort: string, from: number, items: VodItem[]): Promise<VodItem[]> {
  const to = from + PAGE_SIZE - 1
  const params = new URLSearchParams([
    ['id', 'gft:and'],
    ['id', 'g:8'],
    ['sort', sort],
    ['service', 'hulu'],
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
  return fetchHuluAnimeAllPage(sort, from + PAGE_SIZE, accumulated)
}

/**
 * アニメ全般 (TV + 映画) を人気順で取得する。
 */
export async function fetchHuluAnimeAll(): Promise<VodItem[]> {
  return fetchHuluAnimeAllPage('[{"values.weekly_uu":"desc"}]', 0, [])
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

/** Hulu の日付文字列 ("2026/03/31 23:59:59") を dayjs に変換する */
function parseHuluDateStr(dateStr: string): dayjs.Dayjs {
  return dayjs(dateStr.replace(/\//g, '-'))
}

/**
 * 最近配信開始されたアニメを Filtered API で取得する。
 *
 * `publish_start_at` 降順 + `ag:twenty_twenties` + `g:8` で取得し、
 * `startAt` が閾値 (デフォルト30日) 以内のものを返す。
 * 閾値を超えたページで早期打ち切りする。
 */
export async function fetchHuluRecentlyUpdated(thresholdDays = 30): Promise<VodItem[]> {
  const cutoff = dayjs().subtract(thresholdDays, 'day')
  const items: VodItem[] = []
  let from = 0
  for (;;) {
    const to = from + PAGE_SIZE - 1
    const params = new URLSearchParams()
    params.append('id', 'ag:twenty_twenties')
    params.append('id', 'gft:and')
    params.append('id', 'g:8')
    params.set('sort', '[{"publish_start_at":"desc"}]')
    params.set('service', 'hulu')
    params.set('from', String(from))
    params.set('to', String(to))
    const url = `${HULU_FILTERED_API}?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Hulu filtered API error: ${res.status} ${res.statusText} (${url})`)
    const parsed = PaletteResponseSchema.parse(await res.json())
    if (parsed.data.length === 0) break

    let allBelowCutoff = true
    for (const item of parsed.data) {
      if (parseHuluDateStr(item.startAt).isAfter(cutoff)) {
        items.push(item)
        allBelowCutoff = false
      }
    }
    // ページ内の全アイテムが閾値より古い → 以降は全て古いので打ち切り
    if (allBelowCutoff) break
    if (items.length >= parsed.total_count) break
    from += PAGE_SIZE
  }
  return items
}

/**
 * 配信終了間近のアニメを Filtered API で取得する。
 *
 * `publish_end_at` 昇順 + `g:8` で取得し、
 * `endAt` が閾値 (デフォルト30日) 以内のものを返す。
 * 閾値を超えたページで早期打ち切りする。
 */
export async function fetchHuluExpiring(thresholdDays = 30): Promise<VodItem[]> {
  const cutoff = dayjs().add(thresholdDays, 'day')
  const items: VodItem[] = []
  let from = 0
  for (;;) {
    const to = from + PAGE_SIZE - 1
    const params = new URLSearchParams()
    params.append('id', 'gft:and')
    params.append('id', 'g:8')
    params.set('sort', '[{"publish_end_at":"asc"}]')
    params.set('service', 'hulu')
    params.set('from', String(from))
    params.set('to', String(to))
    const url = `${HULU_FILTERED_API}?${params}`
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Hulu filtered API error: ${res.status} ${res.statusText} (${url})`)
    const parsed = PaletteResponseSchema.parse(await res.json())
    if (parsed.data.length === 0) break

    let allBeyondCutoff = true
    for (const item of parsed.data) {
      const endAt = item.endAt
      if (!endAt) continue
      if (parseHuluDateStr(endAt).isBefore(cutoff)) {
        items.push(item)
        allBeyondCutoff = false
      }
    }
    // ページ内の全アイテムが閾値より先 → 以降は全て先なので打ち切り
    if (allBeyondCutoff) break
    if (items.length >= parsed.total_count) break
    from += PAGE_SIZE
  }
  return items
}

const SEASONS = ['winter', 'spring', 'summer', 'autumn'] as const

/**
 * 現在の日付から今期（＋最終月なら来期も）のパレットスラッグを返す。
 *
 * 各四半期の最終月（3月, 6月, 9月, 12月）は来期のパレットも含める。
 * 12月の来期は翌年の冬になる。
 */
export function currentSeasonSlugs(now = dayjs()): string[] {
  const month = now.month() // 0-based
  const year = now.year()
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
    slugs.map((slug) =>
      fetchHuluAnimePage(slug, 0, []).catch((e) => {
        logger.error({ action: 'fetch-season-palette-failed', slug, error: e instanceof Error ? e.message : String(e) })
        return [] as VodItem[]
      })
    )
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
