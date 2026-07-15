import dayjs from 'dayjs'
import { sortBy, uniqBy } from 'lodash-es'
import { parse as parseHtml } from 'node-html-parser'
import { DetailPageJsonSchema, type PageData, WidgetResponseSchema } from '../../../schemas/providers/amazon.dto'
import { type Episode, EpisodeSchema, type Season, type TitleInfo } from '../../../schemas/providers/common.dto'

const AMAZON_DETAIL_BASE = 'https://www.amazon.co.jp/gp/video/detail'
const AMAZON_WIDGETS_API = 'https://www.amazon.co.jp/gp/video/api/getDetailWidgets'
export const FETCH_HEADERS = {
  'Accept-Language': 'ja-JP,ja;q=0.9',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
}

// --- HTML parsing helpers ---

/**
 * 指定 URL の HTML を取得する。
 * @param url - 取得対象の URL
 * @returns HTML 文字列
 * @throws HTTP エラー時
 */
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 503 リトライ用の指数バックオフ + equal jitter（同時実行時の同期集中を避ける）
const backoffMs = (attempt: number) => {
  const base = Math.min(1000 * 2 ** attempt, 16000)
  return Math.round(base / 2 + Math.random() * (base / 2))
}

async function fetchHtml(url: string, retries = 5, requireMarker?: string): Promise<string> {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, { headers: FETCH_HEADERS })
    if (res.ok) {
      const html = await res.text()
      // 200 でも稀に headerDetail を含まない部分応答（負荷時のスロットル）が返るのでリトライ
      if (requireMarker && !html.includes(requireMarker) && attempt < retries - 1) {
        await sleep(backoffMs(attempt))
        continue
      }
      return html
    }
    if (res.status === 503 && attempt < retries - 1) {
      await sleep(backoffMs(attempt))
      continue
    }
    throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  }
  throw new Error(`fetchHtml: unreachable`)
}

/** HTML から指定 type の script タグの中身を抽出する */
function extractScriptContents(html: string, types: string[]): string[] {
  return types.flatMap((type) =>
    [...html.matchAll(new RegExp(`<script[^>]*type="${type}"[^>]*>([\\s\\S]*?)</script>`, 'g'))].map((m) => m[1])
  )
}

/**
 * Prime Video 詳細ページの HTML からタイトル情報を抽出する。
 */
export function extractPageData(html: string): PageData {
  const scripts = extractScriptContents(html, ['text/template', 'application/json'])
    .filter((s) => s.includes('headerDetail'))
    .sort((a, b) => b.length - a.length)

  const results = scripts.map((c) => DetailPageJsonSchema.safeParse(JSON.parse(c)))
  const success = results.find((r) => r.success)
  if (success) return success.data
  const lastError = results.at(-1)?.error
  if (!lastError) throw new Error('Parse failed: no script containing headerDetail found')
  throw lastError
}

/**
 * HTML エンティティをデコードする。
 * @param str - HTML エンティティを含む文字列
 * @returns デコード済みのプレーンテキスト
 */
export function htmlUnescape(str: string): string {
  return parseHtml(str).textContent
}

/** Amazon API の entityType 文字列を共通の EntityType ('tv' | 'movie') にマッピングする */
export function mapEntityType(raw: string): 'tv' | 'movie' {
  return raw === 'Movie' ? 'movie' : 'tv'
}

/**
 * getDetailWidgets API を呼び出し、指定トークンのエピソード一覧を取得する。
 */
async function fetchEpisodesByToken(titleID: string, token: string, retries = 5): Promise<Episode[]> {
  const widgets = JSON.stringify([{ widgetType: 'EpisodeList', widgetToken: token }])
  const params = new URLSearchParams({ titleID, widgets })
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(`${AMAZON_WIDGETS_API}?${params}`, {
      headers: { ...FETCH_HEADERS, 'x-requested-with': 'XMLHttpRequest' }
    })
    if (res.ok) {
      const result = WidgetResponseSchema.safeParse(await res.json())
      if (!result.success) throw result.error
      return result.data
    }
    if (res.status === 503 && attempt < retries - 1) {
      await sleep(backoffMs(attempt))
      continue
    }
    throw new Error(`getDetailWidgets HTTP ${res.status}`)
  }
  throw new Error(`fetchEpisodesByToken: unreachable`)
}

async function fetchAllEpisodes(seasonId: string, pageTokens: string[]): Promise<Episode[]> {
  const episodes: Episode[] = []
  for (const token of pageTokens) {
    const page = await fetchEpisodesByToken(seasonId, token)
    episodes.push(...page)
  }
  return sortBy(uniqBy(episodes, 'episodeId'), 'episodeNumber')
}

// --- main fetcher ---
export async function fetchAmazonTitleDetail(contentId: string): Promise<TitleInfo> {
  if (!/^[A-Za-z0-9_-]+$/.test(contentId)) {
    throw new Error(`Invalid Amazon contentId format: "${contentId}"`)
  }
  const html = await fetchHtml(`${AMAZON_DETAIL_BASE}/${contentId}`, 5, 'headerDetail')
  const page = extractPageData(html)

  const seasons = await buildSeasons(contentId, page)
  return {
    title: page.title,
    description: page.synopsis,
    entityType: page.entityType,
    maturityRating: page.maturityRating,
    imageUrl: page.imageUrl,
    seasons
  }
}

async function buildSeasons(contentId: string, page: PageData): Promise<Season[]> {
  if (page.entityType === 'movie') {
    const episodes = await fetchAllEpisodes(contentId, page.episodePageTokens)
    return [
      {
        seasonId: contentId,
        displayName: '本編',
        seasonNumber: 1,
        episodes:
          episodes.length > 0
            ? episodes
            : (() => {
                const result = EpisodeSchema.safeParse({
                  episodeNumber: 1,
                  episodeId: contentId,
                  title: page.title,
                  description: page.synopsis,
                  releaseDate: page.releaseDate || dayjs().toISOString(),
                  duration: page.duration ?? 0,
                  maturityRating: page.maturityRating,
                  imageUrl: page.imageUrl,
                  hasSubtitles: page.hasSubtitles,
                  hasDub: page.hasDub,
                  benefitId: 'amazon'
                })
                if (!result.success) throw result.error
                return [result.data]
              })()
      }
    ]
  }

  const results: Season[] = []
  for (const rs of page.seasons) {
    if (results.length > 0) await sleep(500)
    const tokens =
      rs.seasonId === contentId
        ? page.episodePageTokens
        : extractPageData(await fetchHtml(`${AMAZON_DETAIL_BASE}/${rs.seasonId}`, 5, 'headerDetail')).episodePageTokens
    const episodes = await fetchAllEpisodes(rs.seasonId, tokens)
    results.push({ ...rs, episodes })
  }
  return results
}
