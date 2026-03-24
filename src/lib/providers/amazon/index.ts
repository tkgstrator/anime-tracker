import { parse } from 'node-html-parser'
import {
  BrowseHTMLSchema,
  type PaginateParams,
  type PaginateResponse,
  PaginateResponseSchema
} from '../../../schemas/providers/amazon.dto'
import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import { logger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { buildAmazonBrowseUrl } from './browse'
import { FETCH_HEADERS, fetchAmazonTitleDetail } from './detail'

const PAGINATE_BASE = 'https://www.amazon.co.jp/gp/video/api/paginateCollection'

const DYNAMIC_FEATURES = [
  'integration',
  'CLIENT_DECORATION_ENABLE_DAAPI',
  'ENABLE_DRAPER_CONTENT',
  'HorizontalPagination',
  'CleanSlate',
  'EpgContainerPagination',
  'ENABLE_GPCI',
  'SupportsImageTextLinkTextInStandardHero',
  'Remaster',
  'SupportsChannelWidget',
  'PromotionalBannerSupported',
  'RemoveFromContinueWatching',
  'SearchChannelBundles',
  'SupportChannelItemDecoration',
  'TvodMovieBundles'
]

export function parseHtml(html: string): Title[] {
  const root = parse(html)

  const script = root.querySelectorAll('script[type="application/json"]').find((s) => s.textContent.includes('titleID'))

  if (!script) return []
  return BrowseHTMLSchema.parse(JSON.parse(script.textContent))
}

/**
 * ブラウズページ HTML からページネーション用パラメータを抽出する。
 */
function extractPaginationParams(html: string): PaginateParams | null {
  const target: RegExpMatchArray | null = (() => {
    const match = html.match(/"paginationTargetId"\s*:\s*"([^"]+)"/)
    return match
  })()
  const token: RegExpMatchArray | null = (() => {
    const match = html.match(/"paginationServiceToken"\s*:\s*"(v0_[^"]+)"/)
    return match
  })()
  if (!target || !token) return null
  return { paginationTargetId: target[1], serviceToken: token[1] }
}

/**
 * paginateCollection API を呼び出してタイトル一覧の続きを取得する。
 */
async function paginateCollection(
  params: PaginateParams,
  startIndex: number,
  cookie: string
): Promise<PaginateResponse> {
  const url = new URL(PAGINATE_BASE)
  url.searchParams.set('jic', '8|EgRzdm9k')
  url.searchParams.set('pageType', 'browse')
  url.searchParams.set('pageId', 'default')
  url.searchParams.set('collectionType', 'Container')
  url.searchParams.set('paginationTargetId', params.paginationTargetId)
  url.searchParams.set('serviceToken', params.serviceToken)
  url.searchParams.set('startIndex', String(startIndex))
  url.searchParams.set('actionScheme', 'default')
  url.searchParams.set('payloadScheme', 'default')
  url.searchParams.set('decorationScheme', 'web-liveFDP-decoration-asins-v2')
  url.searchParams.set('featureScheme', 'web-search-v4')
  for (const f of DYNAMIC_FEATURES) url.searchParams.append('dynamicFeatures', f)
  url.searchParams.set('widgetScheme', 'web-explore-v33')
  url.searchParams.set('variant', 'desktopOSX')
  url.searchParams.set('journeyIngressContext', '')

  const res = await fetch(url.toString(), {
    headers: {
      ...FETCH_HEADERS,
      Cookie: cookie,
      Accept: 'application/json',
      'X-Requested-With': 'XMLHttpRequest'
    }
  })
  if (!res.ok) throw new Error(`paginateCollection error: ${res.status} ${res.statusText}`)
  return PaginateResponseSchema.parse(await res.json())
}

/**
 * Amazon Prime Video プロバイダ。
 *
 * Prime Video のブラウズ API からアニメタイトル一覧を取得し、
 * 詳細ページからシーズン・エピソード情報を取得する。
 */
export class AmazonProvider extends Provider {
  readonly name = 'amazon'

  /**
   * Prime Video のアニメタイトル一覧を取得する。
   *
   * newEpisodesOnly 時は「新着アニメTV」カテゴリのフィルタを使い、
   * ページネーションで全件取得する。
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const response = await this.fetchTitleHTML(options)
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const html: string = await response.text()
    const entries = [...parseHtml(html)]
    const params = extractPaginationParams(html)

    if (params?.paginationTargetId) {
      const seen = new Set(entries.map((e) => e.contentId))
      await this.fetchRemainingPages(params, cookie, entries.length, seen, entries)
    }

    return entries
  }

  private async fetchTitleHTML(options?: FetchTitleListOptions): Promise<Response> {
    const url = options?.newEpisodesOnly ? buildAmazonBrowseUrl({}, { newAnime: true }) : buildAmazonBrowseUrl()
    const response = await fetch(url, { headers: FETCH_HEADERS })
    if (!response.ok) throw new Error('Fetch Title HTML Error')
    return response
  }

  /**
   * ページネーションで残りのタイトルを再帰的に取得する。
   */
  private async fetchRemainingPages(
    params: PaginateParams,
    cookie: string,
    startIndex: number,
    seen: Set<string>,
    acc: Title[]
  ): Promise<void> {
    try {
      const res = await paginateCollection(params, startIndex, cookie)
      const entities = res.entities ?? []
      if (entities.length === 0) return

      for (const e of entities) {
        const titleId = (e as { titleID?: string }).titleID
        if (!titleId || seen.has(titleId)) continue
        seen.add(titleId)
      }

      if (!res.hasMoreItems) return

      const nextToken = res.pagination?.queryParameters?.serviceToken
      await this.fetchRemainingPages(
        { paginationTargetId: params.paginationTargetId, serviceToken: nextToken ?? params.serviceToken },
        cookie,
        startIndex + entities.length,
        seen,
        acc
      )
    } catch (e) {
      logger.error({
        context: 'amazon',
        action: 'pagination-error',
        startIndex,
        error: e instanceof Error ? e.message : String(e)
      })
    }
  }

  /**
   * コンテンツ ID からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * @param contentId - Prime Video のタイトル ID (例: "B0CJRFZ6JD")
   * @returns タイトル詳細情報
   */
  async fetchEpisodeList(contentId: string): Promise<TitleInfo> {
    return fetchAmazonTitleDetail(contentId)
  }
}

export { buildAmazonBrowseUrl, buildSearchParams, buildServiceToken } from './browse'
