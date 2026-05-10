import dayjs from 'dayjs'
import { PaletteResponseSchema, type VodItem } from '../../../schemas/providers/hulu.dto'

const HULU_BASE = 'https://www.hulu.jp'
const HULU_API_BASE = `${HULU_BASE}/api/v2/palettes`
const HULU_FILTERED_API = `${HULU_BASE}/api/v2/filtered`
export const HULU_PAGE_SIZE = 50
const RECENTLY_ADDED_SLUG = 'recentlyadded-anime'

const SEASON_SLUG_PREFIX: Record<string, string> = {
  winter: 'january-march-quarter-anime',
  spring: 'april-june-quarter-anime',
  summer: 'july-september-quarter-anime',
  autumn: 'october-december-quarter-anime'
}

export function buildSlug(season: string, year: number): string {
  const suffix = String(year).slice(-2)
  return `${SEASON_SLUG_PREFIX[season]}${suffix}`
}

/** Hulu の日付文字列 ("2026/03/31 23:59:59") を dayjs に変換する */
function parseHuluDateStr(dateStr: string): dayjs.Dayjs {
  return dayjs(dateStr.replace(/\//g, '-'))
}

/** 共通: ページ取得結果から `next` (次の from 位置) を導出 */
function deriveNext(from: number, total: number): number | null {
  return from + HULU_PAGE_SIZE >= total ? null : from + HULU_PAGE_SIZE
}

/** Palette API の 1 ページを取得 (paginate ヘルパー向け) */
export async function fetchHuluPalettePage(
  slug: string,
  from: number
): Promise<{ items: VodItem[]; next: number | null }> {
  const to = from + HULU_PAGE_SIZE - 1
  const url = `${HULU_API_BASE}/${slug}/vod/objects?from=${from}&to=${to}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Hulu API error: ${res.status} ${res.statusText} (${url})`)
  const result = PaletteResponseSchema.safeParse(await res.json())
  if (!result.success) throw result.error
  return { items: result.data.data, next: deriveNext(from, result.data.total_count) }
}

/** Filtered API (g:8 アニメジャンル) の 1 ページを取得 */
export async function fetchHuluFilteredPage(
  sort: string,
  from: number,
  extra: [string, string][] = []
): Promise<{ items: VodItem[]; total: number; next: number | null }> {
  const to = from + HULU_PAGE_SIZE - 1
  const params = new URLSearchParams([
    ['id', 'gft:and'],
    ['id', 'g:8'],
    ...extra,
    ['sort', sort],
    ['service', 'hulu'],
    ['from', String(from)],
    ['to', String(to)]
  ])
  const url = `${HULU_FILTERED_API}?${params}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Hulu filtered API error: ${res.status} ${res.statusText} (${url})`)
  const result = PaletteResponseSchema.safeParse(await res.json())
  if (!result.success) throw result.error
  return {
    items: result.data.data,
    total: result.data.total_count,
    next: deriveNext(from, result.data.total_count)
  }
}

/** RECENTLY_ADDED スラッグの 1 ページを取得 */
export function fetchRecentlyAddedPage(from: number) {
  return fetchHuluPalettePage(RECENTLY_ADDED_SLUG, from)
}

/**
 * 配信終了間近の 1 ページを取得し、cutoff 判定込みで items を返す。
 * cutoff より先のアイテムだけ残し、ページ全件が cutoff より遠ければ打ち切り。
 */
export function fetchHuluExpiringPage(
  cutoff: dayjs.Dayjs,
  from: number
): Promise<{ items: VodItem[]; total: number; next: number | null; allBeyondCutoff: boolean }> {
  return fetchHuluFilteredPage('[{"publish_end_at":"asc"}]', from).then(({ items, total, next }) => {
    const withinCutoff = items.filter((i) => i.endAt && parseHuluDateStr(i.endAt).isBefore(cutoff))
    const allBeyondCutoff = items.length > 0 && withinCutoff.length === 0
    return {
      items: withinCutoff,
      total,
      next: allBeyondCutoff ? null : next,
      allBeyondCutoff
    }
  })
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
  const isLastMonthOfQuarter = month % 3 === 2
  const baseSlug = buildSlug(SEASONS[quarterIndex], year)
  if (!isLastMonthOfQuarter) return [baseSlug]
  const nextQuarterIndex = (quarterIndex + 1) % 4
  const nextYear = quarterIndex === 3 ? year + 1 : year
  return [baseSlug, buildSlug(SEASONS[nextQuarterIndex], nextYear)]
}
