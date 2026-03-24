import { parse as parseHtml } from 'node-html-parser'
import type { AmazonPageData } from '../../../schemas/providers/amazon.dto'
import { AmazonDetailPageJsonSchema } from '../../../schemas/providers/amazon.dto'
import type { Episode, Season, TitleInfo } from '../../../schemas/providers/common.dto'
import { extractSeasonNumber } from '../../title-parser'

const AMAZON_DETAIL_BASE = 'https://www.amazon.co.jp/gp/video/detail'
const AMAZON_WIDGETS_API = 'https://www.amazon.co.jp/gp/video/api/getDetailWidgets'
export const FETCH_HEADERS = {
  'Accept-Language': 'ja-JP,ja;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
}

/**
 * 「2024年1月5日」形式の日本語日付文字列を ISO 8601 (JST) に変換する。
 * @param dateStr - 日本語形式の日付文字列
 * @returns ISO 8601 形式の日付文字列。パース不可の場合は入力をそのまま返す
 */
function parseJapaneseDate(dateStr: string): string {
  const m = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
  if (!m) return dateStr
  const [, year, month, day] = m
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+09:00`
}

/**
 * レーティング表示文字列から年齢数値を抽出する。
 * @param raw - レーティング文字列 (例: "13+", "PG-16")
 * @returns 年齢数値。抽出できない場合は null
 */
function parseMaturityRating(raw: string): number | null {
  const m = raw.match(/(\d+)/)
  return m ? Number.parseInt(m[1], 10) : null
}

interface RawEpisodeDetail {
  episodeNumber?: number
  title?: string
  synopsis?: string
  isPrime?: boolean
  releaseDate?: string
  duration?: number
  runtime?: string
  images?: { covershot?: string; titleshot?: string }
  subtitles?: string[]
  audioTracks?: string[]
}

// --- HTML parsing helpers ---

/**
 * 指定 URL の HTML を取得する。
 * @param url - 取得対象の URL
 * @returns HTML 文字列
 * @throws HTTP エラー時
 */
export async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  return res.text()
}

/**
 * Prime Video 詳細ページの HTML からタイトル情報を抽出する。
 */
export function extractPageData(html: string): AmazonPageData {
  const root = parseHtml(html)
  const script = root
    .querySelectorAll('script[type="application/json"]')
    .find((s) => s.textContent.includes('headerDetail'))
  if (!script) throw new Error('Parse failed: no JSON script found')

  return AmazonDetailPageJsonSchema.parse(JSON.parse(script.textContent))
}

/**
 * HTML エンティティをデコードする。
 * @param str - HTML エンティティを含む文字列
 * @returns デコード済みのプレーンテキスト
 */
export function htmlUnescape(str: string): string {
  return parseHtml(str).textContent
}

/**
 * API レスポンスのエピソード詳細を Episode 型にマッピングする。
 * @param titleID - エピソードの titleID
 * @param d - API から取得した生のエピソード詳細
 * @param maturityRating - レーティング年齢
 * @param benefitId - ベネフィット ID (例: "prime", "danime")
 * @returns マッピングされたエピソード。episodeNumber がない場合は null
 */
function mapDetailToEpisode(
  titleID: string,
  d: RawEpisodeDetail,
  maturityRating: number | null,
  benefitId: string | null
): Episode | null {
  if (d.episodeNumber == null) return null
  return {
    episodeNumber: d.episodeNumber,
    episodeId: titleID,
    title: d.title ?? '',
    description: htmlUnescape(d.synopsis ?? ''),
    releaseDate: parseJapaneseDate(d.releaseDate ?? ''),
    duration: d.duration ?? 0,
    maturityRating,
    imageUrl: d.images?.covershot || d.images?.titleshot || '',
    hasSubtitles: (d.subtitles?.length ?? 0) > 0,
    hasDub: (d.audioTracks?.length ?? 0) > 1,
    benefitId
  }
}

// --- getDetailWidgets API ---

interface WidgetEpisode {
  titleID: string
  detail: RawEpisodeDetail
  action?: unknown
  metadata?: { maturityRating?: { displayText?: string } }
}

/**
 * エピソードの action オブジェクトから benefitId を抽出する。
 * @param action - getDetailWidgets API レスポンス内の action オブジェクト
 * @returns 小文字化された benefitId。見つからない場合は null
 */
function extractBenefitId(action: unknown): string | null {
  const json = JSON.stringify(action ?? {})
  const m = json.match(/"benefitId"\s*:\s*"([^"]+)"/)
  return m?.[1]?.toLowerCase() ?? null
}

/**
 * getDetailWidgets API を呼び出し、指定トークンのエピソード一覧を取得する。
 * @param titleID - タイトル ID
 * @param token - エピソードリストのウィジェットトークン
 * @param fallbackRating - エピソード個別のレーティングがない場合に使用するフォールバック値
 * @returns エピソード配列
 * @throws HTTP エラー時
 */
async function fetchEpisodesByToken(titleID: string, token: string, fallbackRating: number | null): Promise<Episode[]> {
  const widgets = JSON.stringify([{ widgetType: 'EpisodeList', widgetToken: token }])
  const params = new URLSearchParams({ titleID, widgets })
  const res = await fetch(`${AMAZON_WIDGETS_API}?${params}`, {
    headers: { ...FETCH_HEADERS, 'x-requested-with': 'XMLHttpRequest' }
  })
  if (!res.ok) throw new Error(`getDetailWidgets HTTP ${res.status}`)
  const data = (await res.json()) as {
    widgets?: { episodeList?: { episodes?: WidgetEpisode[] } }
  }
  const rawEpisodes = data.widgets?.episodeList?.episodes
  if (!rawEpisodes) return []
  const episodes: Episode[] = []
  for (const ep of rawEpisodes) {
    const rating = parseMaturityRating(ep.metadata?.maturityRating?.displayText ?? '') ?? fallbackRating
    const benefitId = extractBenefitId(ep.action)
    const mapped = mapDetailToEpisode(ep.titleID, ep.detail, rating, benefitId)
    if (mapped) episodes.push(mapped)
  }
  return episodes
}

/**
 * 全ページトークンを順次取得し、重複を除去したエピソード一覧を返す。
 *
 * エピソード番号の昇順でソートし、同一 episodeId のエピソードは最初の出現のみ保持する。
 * @param seasonId - シーズン ID
 * @param pageTokens - エピソードページのトークン配列
 * @param fallbackRating - フォールバックレーティング値
 * @returns 重複除去・ソート済みのエピソード配列
 */
async function fetchAllEpisodes(
  seasonId: string,
  pageTokens: string[],
  fallbackRating: number | null
): Promise<Episode[]> {
  const pages = await Promise.all(pageTokens.map((token) => fetchEpisodesByToken(seasonId, token, fallbackRating)))
  const episodes = pages.flat().sort((a, b) => a.episodeNumber - b.episodeNumber)

  const seen = new Set<string>()
  return episodes.filter((ep) => {
    if (!ep.episodeId || seen.has(ep.episodeId)) return false
    seen.add(ep.episodeId)
    return true
  })
}

// --- main fetcher ---

/**
 * Amazon のエンティティタイプ文字列を内部表現に変換する。
 * @param raw - Amazon API のエンティティタイプ (例: "Movie", "TV Show")
 * @returns 'movie' または 'tv'
 */
export function mapEntityType(raw: string): 'tv' | 'movie' {
  return raw === 'Movie' ? 'movie' : 'tv'
}

/**
 * Prime Video のタイトル詳細ページからタイトル情報・シーズン・エピソードを取得する。
 *
 * 映画の場合はシーズン無しで返し、TV シリーズの場合は
 * 全シーズンのエピソード情報を含む詳細を返す。
 * @param contentId - Prime Video のタイトル ID (例: "B0CJRFZ6JD")
 * @returns タイトル詳細情報
 */
export async function fetchAmazonTitleDetail(contentId: string): Promise<TitleInfo> {
  const html = await fetchHtml(`${AMAZON_DETAIL_BASE}/${contentId}`)
  const page = extractPageData(html)
  const title = page.title
  const description = page.synopsis
  const entityType = page.entityType
  const { maturityRating } = page

  if (entityType === 'movie') {
    return { title, description, entityType, maturityRating, benefitId: null, seasons: [] }
  }

  if (page.seasons.length === 0) {
    const episodes = await fetchAllEpisodes(contentId, page.episodePageTokens, maturityRating)
    const benefitId = episodes[0]?.benefitId ?? null
    const seasonNumber = extractSeasonNumber(title)
    return {
      title,
      description,
      entityType,
      maturityRating,
      benefitId,
      seasons: [
        {
          seasonId: contentId,
          displayName: `シーズン${seasonNumber}`,
          seasonNumber,
          imageUrl: episodes[0]?.imageUrl ?? null,
          episodes
        }
      ]
    }
  }

  const seasons: Season[] = []
  for (const rs of page.seasons) {
    const tokens =
      rs.seasonId === contentId
        ? page.episodePageTokens
        : extractPageData(await fetchHtml(`${AMAZON_DETAIL_BASE}/${rs.seasonId}`)).episodePageTokens
    const episodes = await fetchAllEpisodes(rs.seasonId, tokens, maturityRating)
    seasons.push({
      seasonId: rs.seasonId,
      displayName: rs.displayName,
      seasonNumber: rs.seasonNumber,
      imageUrl: episodes[0]?.imageUrl ?? null,
      episodes
    })
  }

  const benefitId = seasons[0]?.episodes[0]?.benefitId ?? null
  return { title, description, entityType, maturityRating, benefitId, seasons }
}
