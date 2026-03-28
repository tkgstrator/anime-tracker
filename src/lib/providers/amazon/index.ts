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

/** 新着系として打ち切り判定に使うバッジ */
const NEW_BADGES = new Set(['新エピソード', '新着', '新作'])

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
   * - `expiring`: 「配信終了間近」カテゴリのみ取得
   * - `new_episode`: 新着アニメ (NEW_EPISODE + RECENTLY_ADDED)
   * - 未指定: 全タイトル取得
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const category = options?.category
    const mode = category ?? 'all'
    logger.info({ action: 'fetch-title-list-start', mode })

    if (category === 'expiring') {
      const cached = await this.cache?.get('browse:expiring:latest')
      if (cached) {
        const envelope = JSON.parse(cached)
        const titles = TitleSchema.array().parse(envelope.titles)
        logger.info({ action: 'fetch-title-list-cached', mode, fetchedAt: envelope.fetchedAt, count: titles.length })
        return titles
      }
    }

    const buildOptions =
      category === 'expiring'
        ? { expiring: true as const }
        : category === 'new_episode'
          ? { newAnime: true as const }
          : undefined
    const allTitles = await this.fetchPages(buildOptions, mode)

    // new_episode: NEW_EPISODE + RECENTLY_ADDED の両方を返す
    if (category === 'new_episode') {
      const titles = allTitles.filter((t) => t.badge === 'NEW_EPISODE' || t.badge === 'RECENTLY_ADDED')
      logger.info({ action: 'fetch-title-list-done', mode, count: titles.length, total: allTitles.length })
      return titles
    }
    if (category === 'coming_soon') {
      // Amazon にはもうすぐ配信のバッジがないため空を返す
      logger.info({ action: 'fetch-title-list-done', mode, count: 0 })
      return []
    }

    logger.info({ action: 'fetch-title-list-done', mode, count: allTitles.length })
    return allTitles
  }

  /**
   * Cookie 取得 → 自前トークン生成 → 順次ページ取得する。
   *
   * ブラウズページの HTML パースを不要にし、paginateCollection API を順次呼び出す。
   * newAnime モードでは新着系バッジが連続で出なくなったら早期に打ち切る。
   */
  private async fetchPages(buildOptions: Parameters<typeof buildPaginationToken>[0], label: string): Promise<Title[]> {
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

    // 3. 順次取得（newAnime は早期打ち切りあり）
    const earlyStop = !!buildOptions?.newAnime
    const MAX_EMPTY_PAGES = 2

    const seen = new Set<string>()
    const titles: Title[] = []
    let startIndex = 0
    let emptyStreak = 0
    let pageCount = 0
    let skipCount = 0

    for (;;) {
      let res: PaginateResponse
      try {
        res = await paginateCollection(params, startIndex, cookie)
      } catch (e) {
        logger.error({
          action: 'pagination-error',
          startIndex,
          error: e instanceof Error ? e.message : String(e)
        })
        break
      }

      if (res.entities.length === 0) break
      pageCount++

      let hasNewBadge = false
      for (const e of res.entities) {
        if (earlyStop) {
          const badge = (e as Record<string, { titleMetadataBadge?: { message?: string } }>).entitlementCues
            ?.titleMetadataBadge?.message
          if (badge && NEW_BADGES.has(badge)) hasNewBadge = true
        }

        const parsed = BrowseEntitySchema.safeParse(e)
        if (!parsed.success) {
          skipCount++
          continue
        }
        const title = parsed.data
        if (seen.has(title.contentId)) continue
        seen.add(title.contentId)
        titles.push(title)
      }

      if (earlyStop) {
        emptyStreak = hasNewBadge ? 0 : emptyStreak + 1
        if (emptyStreak >= MAX_EMPTY_PAGES) {
          logger.debug({ action: 'early-stop', startIndex, emptyStreak })
          break
        }
      }

      logger.debug({
        action: 'pagination-page',
        startIndex,
        fetched: res.entities.length,
        unique: titles.length
      })

      if (!res.hasMoreItems) break
      startIndex += res.entities.length
    }

    logger.info({
      action: 'fetch-pages-done',
      label,
      pages: pageCount,
      unique: titles.length,
      skipped: skipCount,
      earlyStop
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
