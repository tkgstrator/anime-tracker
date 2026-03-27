import pLimit from 'p-limit'
import {
  BrowseEntitySchema,
  type PaginateParams,
  type PaginateResponse,
  PaginateResponseSchema
} from '../../../schemas/providers/amazon.dto'
import { type Title, type TitleInfo, TitleSchema } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { buildPaginationToken } from './browse'

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
    }

    const buildOptions = options?.expiringOnly
      ? { expiring: true as const }
      : options?.newEpisodesOnly
        ? { newAnime: true as const }
        : undefined
    const titles = await this.fetchParallel(buildOptions, mode)
    logger.info({ action: 'fetch-title-list-done', mode, count: titles.length })
    return titles
  }

  /**
   * Cookie 取得 → 自前トークン生成 → 全ページ並列取得する。
   *
   * ブラウズページの HTML パースを不要にし、`p-limit` で同時実行数を制御しながら
   * paginateCollection API を並列に呼び出す。
   */
  private async fetchParallel(
    buildOptions: Parameters<typeof buildPaginationToken>[0],
    label: string
  ): Promise<Title[]> {
    // 1. 軽量ページから Cookie を取得
    const cookieRes = await fetch('https://www.amazon.co.jp/gp/video/', {
      headers: FETCH_HEADERS,
      redirect: 'manual'
    })
    const cookie = cookieRes.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    logger.debug({ action: 'fetch-cookie', label, hasCookie: cookie.length > 0 })

    // 2. ページネーショントークンを自前生成
    const serviceToken = buildPaginationToken(buildOptions)
    const params: PaginateParams = { paginationTargetId: 'default', serviceToken }

    // 3. 最初のページを取得して総数を推定
    const firstPage = await paginateCollection(params, 0, cookie)
    const pageSize = firstPage.entities.length
    if (pageSize === 0) {
      logger.warn({ action: 'fetch-parallel-empty', label })
      return []
    }

    // 4. 残りページを並列取得
    const limit = pLimit(5)
    const pageIndices: number[] = []
    if (firstPage.hasMoreItems) {
      // 最大ページ数の上限を設定 (安全弁)
      const MAX_PAGES = 100
      for (let i = 1; i <= MAX_PAGES; i++) {
        pageIndices.push(i * pageSize)
      }
    }

    const remainingPages = await Promise.all(
      pageIndices.map((startIndex) =>
        limit(async () => {
          try {
            return await paginateCollection(params, startIndex, cookie)
          } catch (e) {
            logger.error({
              action: 'pagination-error',
              startIndex,
              error: e instanceof Error ? e.message : String(e)
            })
            return null
          }
        })
      )
    )

    // 5. 全ページのエンティティを集約・パース
    const allPages = [firstPage, ...remainingPages.filter((p): p is PaginateResponse => p !== null)]
    const seen = new Set<string>()
    const titles: Title[] = []
    let skipCount = 0

    for (const page of allPages) {
      if (page.entities.length === 0) break // 空ページ以降は打ち切り

      for (const e of page.entities) {
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
        if (seen.has(title.contentId)) continue
        seen.add(title.contentId)
        titles.push(title)
      }
    }

    logger.info({
      action: 'fetch-parallel-done',
      label,
      pages: allPages.length,
      totalEntities: allPages.reduce((sum, p) => sum + p.entities.length, 0),
      unique: titles.length,
      skipped: skipCount
    })

    return titles
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
