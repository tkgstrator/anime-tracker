import dayjs from 'dayjs'
import {
  BrowseEntitySchema,
  BrowseHTMLSchema,
  type PaginateParams,
  type PaginateResponse,
  PaginateResponseSchema
} from '../../../schemas/providers/amazon.dto'
import { type Title, type TitleInfo, TitleSchema } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { buildAmazonBrowseUrl } from './browse'

export { buildServiceToken } from './browse'

import { FETCH_HEADERS, fetchAmazonTitleDetail } from './detail'

const logger = getAppLogger('amazon')

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
  const scriptTypes = ['text/template', 'application/json']
  for (const type of scriptTypes) {
    const scripts = [...html.matchAll(new RegExp(`<script[^>]*type="${type}"[^>]*>([\\s\\S]*?)</script>`, 'g'))].sort(
      (a, b) => b[1].length - a[1].length
    )

    for (const [, content] of scripts) {
      if (!content.includes('titleID')) continue
      try {
        const titles = BrowseHTMLSchema.parse(JSON.parse(content))
        logger.debug({ action: 'parse-html', scriptType: type, titleCount: titles.length })
        return titles
      } catch {
        // noop
      }
    }
  }
  logger.warn({ action: 'parse-html', message: 'No titles found in HTML' })
  return []
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

  logger.debug({ action: 'paginate-request', startIndex })

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
   * - `expiringOnly` 時: 「配信終了間近」カテゴリのみ取得
   * - `newEpisodesOnly` 時: 「新着アニメTV」カテゴリのみ取得
   * - どちらも未指定: 全タイトル取得
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const mode = options?.expiringOnly ? 'expiring' : options?.newEpisodesOnly ? 'new_episode' : 'all'
    logger.info({ action: 'fetch-title-list-start', mode })

    if (options?.expiringOnly) {
      const cached = await this.cache?.get('browse:expiring:latest')
      if (cached) {
        const envelope = JSON.parse(cached)
        const titles = TitleSchema.array().parse(envelope.titles)
        logger.info({ action: 'fetch-title-list-cached', mode, fetchedAt: envelope.fetchedAt, count: titles.length })
        return titles
      }
      const titles = await this.fetchBrowse(buildAmazonBrowseUrl({}, { expiring: true }), 'expiring')
      logger.info({ action: 'fetch-title-list-done', mode, count: titles.length })
      return titles
    }

    const titles = await this.fetchBrowse(
      options?.newEpisodesOnly ? buildAmazonBrowseUrl({}, { newAnime: true }) : buildAmazonBrowseUrl(),
      mode
    )
    logger.info({ action: 'fetch-title-list-done', mode, count: titles.length })
    return titles
  }

  /**
   * 指定 URL のブラウズページからタイトル一覧を取得する（ページネーション含む）。
   */
  private async fetchBrowse(url: string, label: string): Promise<Title[]> {
    logger.debug({ action: 'fetch-browse', url })
    const response = await fetch(url, { headers: FETCH_HEADERS })
    if (!response.ok) {
      logger.error({ action: 'fetch-browse', status: response.status, url })
      throw new Error(`Fetch browse error: ${response.status}`)
    }
    const cookie = response.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    const html: string = await response.text()
    logger.debug({ action: 'fetch-browse-html', htmlSize: html.length })
    await this.cache?.put(`debug:browse:${label}:${dayjs().format('YYYY-MM-DD:HH:mm:ss')}`, html)
    const entries = [...parseBrowseHtml(html)]
    const params = extractPaginationParams(html)

    if (params?.paginationTargetId) {
      logger.debug({ action: 'pagination-start', initialCount: entries.length })
      const seen = new Set(entries.map((e) => e.contentId))
      await this.fetchRemainingPages(params, cookie, entries.length, seen, entries)
      logger.debug({ action: 'pagination-done', totalCount: entries.length })
    }

    return entries
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
      if (entities.length === 0) {
        logger.debug({ action: 'pagination-empty', startIndex })
        return
      }

      let newCount = 0
      let skipCount = 0
      for (const e of entities) {
        const parsed = BrowseEntitySchema.safeParse(e)
        if (!parsed.success) {
          skipCount++
          const issue = parsed.error.issues[0]
          logger.debug({
            action: 'pagination-parse-skip',
            titleID: (e as Record<string, unknown>).titleID ?? null,
            path: issue?.path?.join('.'),
            error: issue?.message
          })
          continue
        }
        const title = parsed.data
        if (seen.has(title.contentId)) {
          skipCount++
          continue
        }
        seen.add(title.contentId)
        acc.push(title)
        newCount++
      }

      logger.debug({
        action: 'pagination-page',
        startIndex,
        fetched: entities.length,
        new: newCount,
        skipped: skipCount,
        hasMore: res.hasMoreItems
      })

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
  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchAmazonTitleDetail(contentId)
    logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      entityType: detail.entityType,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
