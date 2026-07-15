import {
  BrowseEntitySchema,
  type PaginateParams,
  type PaginateResponse,
  PaginateResponseSchema
} from '../../../schemas/providers/amazon.dto'
import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { Provider } from '../base'
import { type BuildOptions, buildPaginationToken } from './browse'

export { buildServiceToken } from './browse'

import { fetchAllChannelNewArrivals } from './channel'
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
 * catalog 全件列挙用のソート値。
 * 同じカタログでもソートを変えると返るタイトルセットが変わるため、複数を merge する。
 *
 * - featured-rank は他と完全重複するので除外。
 * - pv-public-release-date-asc-rank は Amazon が browse ページにページネーショントークンを
 *   埋め込まず結果が返らないため除外。
 */
const CATALOG_SORT_VALUES = [
  'titlerank',
  'review-rank',
  'relevancerank',
  'price-desc-rank',
  'price-asc-rank',
  'date-desc-rank',
  'date-asc-rank',
  'pv-public-release-date-desc-rank'
] as const

/** catalog の base pass。各 base pass を全 sort 値で叩く */
const CATALOG_BASE_PASSES: { label: string; opts: Omit<BuildOptions, 'sort' | 'sortValue'> }[] = [
  { label: 'svod', opts: { offer: 'svod' } },
  { label: 'svod-genre-bin', opts: { offer: 'svod', genreBin: true } },
  { label: 'tvod', opts: { offer: 'tvod' } },
  { label: 'tvod-genre-bin', opts: { offer: 'tvod', genreBin: true } },
  { label: 'subscription', opts: { offer: 'subscription' } },
  { label: 'subscription-genre-bin', opts: { offer: 'subscription', genreBin: true } },
  { label: 'danime', opts: { offer: 'subscription', subscriptionId: 'danime', benefit: 'danime' } },
  {
    label: 'animetimesjp',
    opts: { offer: 'subscription', subscriptionId: 'animetimesjp', benefit: 'animetimesjp', node: '2351649051' }
  }
]

/** 全 catalog パス (base × sort 値) */
const CATALOG_PASSES: { label: string; opts: BuildOptions }[] = CATALOG_BASE_PASSES.flatMap(({ label, opts }) =>
  CATALOG_SORT_VALUES.map((sv) => ({
    label: `${label}/${sv}`,
    opts: { ...opts, sort: true, sortValue: sv }
  }))
)

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
  const result = PaginateResponseSchema.safeParse(await res.json())
  if (!result.success) throw result.error
  return result.data
}

/**
 * Amazon Prime Video プロバイダ。
 *
 * Prime Video のブラウズ API からアニメタイトル一覧を取得し、
 * 詳細ページからシーズン・エピソード情報を取得する。
 */
export class AmazonProvider extends Provider {
  readonly name = 'amazon'

  protected async fetchNewEpisode(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'new_episode' })
    const [svodRaw, channelTitles] = await Promise.all([
      this.fetchPages({ newAnime: true as const }, 'new_episode'),
      fetchAllChannelNewArrivals()
    ])
    const svod = svodRaw.filter((t) => t.badge === 'NEW_EPISODE' || t.badge === 'RECENTLY_ADDED')
    const titles = this.dedupeBy([...svod, ...channelTitles], (t) => t.contentId)
    logger.info({
      action: 'fetch-title-list-done',
      mode: 'new_episode',
      svod: svod.length,
      channels: channelTitles.length,
      union: titles.length
    })
    return titles
  }

  protected async fetchExpiring(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'expiring' })
    const titles = await this.fetchPages({ expiring: true as const }, 'expiring')
    logger.info({ action: 'fetch-title-list-done', mode: 'expiring', count: titles.length })
    return titles
  }

  protected async fetchCatalog(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'catalog', passes: CATALOG_PASSES.length })
    const cookie = await this.fetchCookie('catalog')
    const merged = new Map<string, Title>()
    for (const pass of CATALOG_PASSES) {
      const passTitles = await this.paginateAll(cookie, pass.opts, `catalog/${pass.label}`)
      for (const t of passTitles) {
        if (!merged.has(t.contentId)) merged.set(t.contentId, t)
      }
      logger.info({
        action: 'catalog-pass-done',
        label: pass.label,
        pass: passTitles.length,
        merged: merged.size
      })
    }
    const titles = [...merged.values()]
    logger.info({ action: 'fetch-title-list-done', mode: 'catalog', count: titles.length })
    return titles
  }

  private async fetchCookie(label: string): Promise<string> {
    const res = await fetch('https://www.amazon.co.jp/gp/video/', {
      headers: FETCH_HEADERS,
      redirect: 'manual'
    })
    const cookie = res.headers
      .getSetCookie()
      .map((c) => c.split(';')[0])
      .join('; ')
    logger.debug({ action: 'fetch-cookie', label, hasCookie: cookie.length > 0 })
    return cookie
  }

  /**
   * Cookie 取得 → 自前トークン生成 → 順次ページ取得する。
   *
   * ブラウズページの HTML パースを不要にし、paginateCollection API を順次呼び出す。
   * newAnime モードでは新着系バッジが連続で出なくなったら早期に打ち切る。
   */
  private async fetchPages(buildOptions: Parameters<typeof buildPaginationToken>[0], label: string): Promise<Title[]> {
    const cookie = await this.fetchCookie(label)
    return this.paginateAll(cookie, buildOptions, label)
  }

  private async paginateAll(
    cookie: string,
    buildOptions: Parameters<typeof buildPaginationToken>[0],
    label: string
  ): Promise<Title[]> {
    const serviceToken = buildPaginationToken(buildOptions)
    const params: PaginateParams = { paginationTargetId: 'default', serviceToken }

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
