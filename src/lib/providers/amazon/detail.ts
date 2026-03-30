import dayjs from 'dayjs'
import { sortBy, uniqBy } from 'lodash-es'
import { parse as parseHtml } from 'node-html-parser'
import { DetailPageJsonSchema, type PageData, WidgetResponseSchema } from '../../../schemas/providers/amazon.dto'
import type { Episode, Season, TitleInfo } from '../../../schemas/providers/common.dto'
import { extractSeasonNumber } from '../../title-parser'

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
async function fetchHtml(url: string): Promise<string> {
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}: ${url}`)
  return res.text()
}

/**
 * Prime Video 詳細ページの HTML からタイトル情報を抽出する。
 */
export function extractPageData(html: string): PageData {
  const scripts = ['text/template', 'application/json'].flatMap((type) =>
    [...html.matchAll(new RegExp(`<script[^>]*type="${type}"[^>]*>([\\s\\S]*?)</script>`, 'g'))].map((m) => m[1])
  )

  for (const content of sortBy(scripts, (s) => -s.length)) {
    if (!content.includes('headerDetail')) continue
    try {
      return DetailPageJsonSchema.parse(JSON.parse(content))
    } catch {
      // noop
    }
  }
  throw new Error('Parse failed: no JSON script found')
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
async function fetchEpisodesByToken(titleID: string, token: string): Promise<Episode[]> {
  const widgets = JSON.stringify([{ widgetType: 'EpisodeList', widgetToken: token }])
  const params = new URLSearchParams({ titleID, widgets })
  const res = await fetch(`${AMAZON_WIDGETS_API}?${params}`, {
    headers: { ...FETCH_HEADERS, 'x-requested-with': 'XMLHttpRequest' }
  })
  if (!res.ok) throw new Error(`getDetailWidgets HTTP ${res.status}`)
  return WidgetResponseSchema.parse(await res.json())
}

/**
 * 全ページトークンを順次取得し、重複を除去したエピソード一覧を返す。
 */
async function fetchAllEpisodes(seasonId: string, pageTokens: string[]): Promise<Episode[]> {
  const pages = await Promise.all(pageTokens.map((token) => fetchEpisodesByToken(seasonId, token)))
  return sortBy(uniqBy(pages.flat(), 'episodeId'), 'episodeNumber')
}

// --- main fetcher ---
export async function fetchAmazonTitleDetail(contentId: string): Promise<TitleInfo> {
  const html = await fetchHtml(`${AMAZON_DETAIL_BASE}/${contentId}`)
  const page = extractPageData(html)

  const seasons = await buildSeasons(contentId, page)
  return {
    title: page.title,
    description: page.synopsis,
    entityType: page.entityType,
    maturityRating: page.maturityRating,
    imageUrl: page.imageUrl,
    benefitId: seasons[0]?.episodes[0]?.benefitId ?? null,
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
            : [
                {
                  episodeNumber: 1,
                  episodeId: contentId,
                  title: page.title,
                  description: page.synopsis,
                  releaseDate: dayjs().toISOString(),
                  duration: 0,
                  maturityRating: page.maturityRating,
                  imageUrl: page.imageUrl,
                  hasSubtitles: false,
                  hasDub: false,
                  benefitId: null
                }
              ]
      }
    ]
  }

  if (page.seasons.length === 0) {
    const episodes = await fetchAllEpisodes(contentId, page.episodePageTokens)
    return [
      {
        seasonId: contentId,
        displayName: `シーズン${extractSeasonNumber(page.title)}`,
        seasonNumber: extractSeasonNumber(page.title),
        episodes
      }
    ]
  }

  return Promise.all(
    page.seasons.map(async (rs) => {
      const tokens =
        rs.seasonId === contentId
          ? page.episodePageTokens
          : extractPageData(await fetchHtml(`${AMAZON_DETAIL_BASE}/${rs.seasonId}`)).episodePageTokens
      const episodes = await fetchAllEpisodes(rs.seasonId, tokens)
      return { ...rs, episodes }
    })
  )
}
