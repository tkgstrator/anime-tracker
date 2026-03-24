import { parse as parseHtml } from 'node-html-parser'
import { AmazonBrowseHTMLSchema } from '@/schemas/amazon.dto'
import type { Title, TitleInfo } from '../../../schemas/provider.dto'
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

export function parseBrowseHtml(html: string): Title[] {
  const root = parseHtml(html)

  const script = root.querySelectorAll('script[type="application/json"]').find((s) => s.textContent.includes('titleID'))

  if (!script) return []
  return AmazonBrowseHTMLSchema.parse(JSON.parse(script.textContent))
}

/**
 * ブラウズページ HTML からページネーション用パラメータを抽出する。
 */
function extractPaginationParams(html: string): { paginationTargetId: string; serviceToken: string } | null {
  const targetMatch = html.match(/"paginationTargetId"\s*:\s*"([^"]+)"/)
  const tokenMatch = html.match(/"paginationServiceToken"\s*:\s*"(v0_[^"]+)"/)
  if (!targetMatch || !tokenMatch) return null
  return { paginationTargetId: targetMatch[1], serviceToken: tokenMatch[1] }
}

interface PaginateResponse {
  entities?: Record<string, unknown>[]
  hasMoreItems?: boolean
  pagination?: {
    queryParameters?: {
      serviceToken?: string
    }
  }
}

/**
 * paginateCollection API を呼び出してタイトル一覧の続きを取得する。
 */
async function paginateCollection(
  paginationTargetId: string,
  serviceToken: string,
  startIndex: number,
  cookie: string
): Promise<PaginateResponse> {
  const url = new URL(PAGINATE_BASE)
  url.searchParams.set('jic', '8|EgRzdm9k')
  url.searchParams.set('pageType', 'browse')
  url.searchParams.set('pageId', 'default')
  url.searchParams.set('collectionType', 'Container')
  url.searchParams.set('paginationTargetId', paginationTargetId)
  url.searchParams.set('serviceToken', serviceToken)
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
  return res.json() as Promise<PaginateResponse>
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
    const url = options?.newEpisodesOnly ? buildAmazonBrowseUrl({}, { newAnime: true }) : buildAmazonBrowseUrl()
    const browseRes = await fetch(url, { headers: FETCH_HEADERS })
    if (!browseRes.ok) throw new Error(`Browse page error: ${browseRes.status} ${browseRes.statusText}`)

    const cookie = browseRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const html = await browseRes.text()
    const initialEntries = parseBrowseHtml(html)
    const allEntries = [...initialEntries]

    if (!options?.newEpisodesOnly) {
      return allEntries.map((e) => e.title)
    }

    const seen = new Set(initialEntries.map((e) => e.title.contentId))
    const pagination = extractPaginationParams(html)

    if (pagination) {
      await this.fetchRemainingPages(pagination, cookie, initialEntries.length, seen, allEntries)
    }

    return allEntries.map((e) => e.title)
  }

  /**
   * ページネーションで残りのタイトルを再帰的に取得する。
   */
  private async fetchRemainingPages(
    pagination: { paginationTargetId: string; serviceToken: string },
    cookie: string,
    startIndex: number,
    seen: Set<string>,
    acc: BrowseEntity[]
  ): Promise<void> {
    try {
      const res = await paginateCollection(pagination.paginationTargetId, pagination.serviceToken, startIndex, cookie)
      const entities = res.entities ?? []
      if (entities.length === 0) return

      for (const e of entities) {
        const titleId = e.titleID as string
        if (!titleId || seen.has(titleId)) continue
        seen.add(titleId)
        acc.push(parseEntity(e))
      }

      if (!res.hasMoreItems) return

      const nextToken = res.pagination?.queryParameters?.serviceToken
      await this.fetchRemainingPages(
        { paginationTargetId: pagination.paginationTargetId, serviceToken: nextToken ?? pagination.serviceToken },
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
