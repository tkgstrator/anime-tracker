import { parseArgs } from 'util'
import { parseBrowseHtml, buildServiceToken } from '../src/lib/providers/amazon'
import { BrowseQuerySchema } from '../src/schemas/providers/amazon.dto'
import { FETCH_HEADERS, htmlUnescape, mapEntityType } from '../src/lib/providers/amazon/detail'
import type { BuildOptions } from '../src/lib/providers/amazon/browse'
import type { Title } from '../src/schemas/providers/common.dto'

const PAGINATE_BASE = 'https://www.amazon.co.jp/gp/video/api/paginateCollection'
/** featured-rank は他のソートと完全重複するため除外 */
const SORT_VALUES = [
  'titlerank',
  'review-rank',
  'relevancerank',
  'price-desc-rank',
  'price-asc-rank',
  'date-desc-rank',
  'date-asc-rank',
  'pv-public-release-date-desc-rank',
  'pv-public-release-date-asc-rank',
]

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
  'TvodMovieBundles',
]

const BENEFIT_CONFIG: Record<string, { subscriptionId: string; benefit: string; node?: string }> = {
  danime: { subscriptionId: 'danime', benefit: 'danime' },
  animetimesjp: { subscriptionId: 'animetimesjp', benefit: 'animetimesjp', node: '2351649051' },
}

/** オファー × ソートの基本パス定義 */
const BASE_PASSES: { label: string; opts: Omit<BuildOptions, 'sort' | 'sortValue'> }[] = [
  { label: 'svod', opts: { offer: 'svod' } },
  { label: 'svod genre-bin', opts: { offer: 'svod', genreBin: true } },
  { label: 'tvod', opts: { offer: 'tvod' } },
  { label: 'tvod genre-bin', opts: { offer: 'tvod', genreBin: true } },
  { label: 'subscription', opts: { offer: 'subscription' } },
  { label: 'subscription genre-bin', opts: { offer: 'subscription', genreBin: true } },
  { label: 'danime', opts: { offer: 'subscription', subscriptionId: 'danime', benefit: 'danime' } },
  {
    label: 'animetimesjp',
    opts: { offer: 'subscription', subscriptionId: 'animetimesjp', benefit: 'animetimesjp', node: '2351649051' },
  },
]

/** --offer all で実行する全パス = 基本パス × 全ソート値 */
const ALL_PASSES: { label: string; opts: BuildOptions }[] = BASE_PASSES.flatMap(({ label, opts }) =>
  SORT_VALUES.map((sv) => ({
    label: `${label} ${sv}`,
    opts: { ...opts, sort: true, sortValue: sv },
  })),
)

interface PaginateResponse {
  entities?: Record<string, unknown>[]
  hasMoreItems?: boolean
  pagination?: {
    queryParameters?: {
      serviceToken?: string
    }
  }
}

/** ページネーション API の entity を parseBrowseHtml と同じ Title 形式に変換する */
function toTitle(e: Record<string, unknown>): Title {
  return {
    contentId: e.titleID as string,
    title: htmlUnescape(e.displayTitle as string),
    description: htmlUnescape((e.synopsis as string) ?? ''),
    entityType: mapEntityType(e.entityType as string),
    imageUrl: ((e.images as { cover?: { url?: string } })?.cover?.url as string) ?? null,
    maturityRating: null,
  }
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    token: { type: 'string' },
    cookie: { type: 'string' },
    benefit: { type: 'string' },
    offer: { type: 'string' },
    out: { type: 'string' },
    delay: { type: 'string', default: '500' },
  },
})

const delayMs = Number.parseInt(values.delay!, 10)

function extractPaginationParams(html: string): { paginationTargetId: string; serviceToken: string } {
  const targetMatch = html.match(/"paginationTargetId"\s*:\s*"([^"]+)"/)
  if (!targetMatch) throw new Error('paginationTargetId not found in HTML')

  const tokenMatch = html.match(/"paginationServiceToken"\s*:\s*"(v0_[^"]+)"/)
  if (!tokenMatch) throw new Error('paginationServiceToken not found in HTML')

  return { paginationTargetId: targetMatch[1], serviceToken: tokenMatch[1] }
}

async function paginateCollection(
  paginationTargetId: string,
  serviceToken: string,
  startIndex: number,
  cookie: string,
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
      'X-Requested-With': 'XMLHttpRequest',
    },
  })
  if (!res.ok) throw new Error(`paginateCollection error: ${res.status} ${res.statusText}`)
  return res.json() as Promise<PaginateResponse>
}

/**
 * 1パス分のブラウズ＋ページネーションを実行し、タイトルを収集する
 */
async function fetchAllPages(
  buildOpts: BuildOptions,
  label: string,
  seen: Set<string>,
  allTitles: Title[],
): Promise<void> {
  const query = BrowseQuerySchema.parse({})
  const token = buildServiceToken(query, buildOpts)
  const browseUrl = `https://www.amazon.co.jp/gp/video/browse/ref=atv_dp_pd_gen?serviceToken=v0_${encodeURIComponent(token)}`

  console.log(`\n--- Pass: ${label} ---`)
  const browseRes = await fetch(browseUrl, { headers: FETCH_HEADERS })
  if (!browseRes.ok) throw new Error(`Browse page error: ${browseRes.status}`)

  const setCookies = browseRes.headers.getSetCookie()
  const cookie = values.cookie ?? setCookies.map((c) => c.split(';')[0]).join('; ')
  const html = await browseRes.text()

  const initialEntries = parseBrowseHtml(html)
  for (const entry of initialEntries) {
    if (!seen.has(entry.title.contentId)) {
      seen.add(entry.title.contentId)
      allTitles.push(entry.title)
    }
  }
  console.log(`Initial: ${initialEntries.length} items (total: ${allTitles.length})`)

  const { paginationTargetId, serviceToken: initialPaginationToken } = extractPaginationParams(html)
  let currentToken = initialPaginationToken
  let startIndex = initialEntries.length

  while (true) {
    await new Promise((r) => setTimeout(r, delayMs))

    try {
      const res = await paginateCollection(paginationTargetId, currentToken, startIndex, cookie)
      const entities = res.entities ?? []

      let newCount = 0
      for (const e of entities) {
        const titleId = e.titleID as string
        if (titleId && !seen.has(titleId)) {
          seen.add(titleId)
          allTitles.push(toTitle(e))
          newCount++
        }
      }

      console.log(`startIndex=${startIndex}: ${entities.length} items, ${newCount} new (total: ${allTitles.length})`)

      if (entities.length === 0 || !res.hasMoreItems) break

      const nextToken = res.pagination?.queryParameters?.serviceToken
      if (nextToken) {
        currentToken = nextToken
      }
      startIndex += entities.length
    } catch (err) {
      console.error(`Error at startIndex=${startIndex}:`, err instanceof Error ? err.message : err)
      break
    }
  }
}

// --- Main ---

const seen = new Set<string>()
const allTitles: Title[] = []

if (values.token) {
  // --token 指定時は単一パスで実行
  await fetchAllPages({} as BuildOptions, `token=${values.token.slice(0, 20)}...`, seen, allTitles)
} else if (values.offer === 'all') {
  // 全パス実行
  for (const pass of ALL_PASSES) {
    await fetchAllPages(pass.opts, pass.label, seen, allTitles)
  }
} else {
  // 個別指定
  const baseBuildOpts: BuildOptions = {}

  if (values.offer) {
    baseBuildOpts.offer = values.offer as 'svod' | 'tvod' | 'subscription'
  }

  if (values.benefit) {
    const cfg = BENEFIT_CONFIG[values.benefit]
    if (cfg) {
      baseBuildOpts.offer = 'subscription'
      baseBuildOpts.subscriptionId = cfg.subscriptionId
      baseBuildOpts.benefit = cfg.benefit
      if (cfg.node) baseBuildOpts.node = cfg.node
    }
  }

  // 全ソート値でパスを実行してマージ
  for (const sv of SORT_VALUES) {
    await fetchAllPages({ ...baseBuildOpts, sort: true, sortValue: sv }, sv, seen, allTitles)
  }
}

console.log(`\nTotal: ${allTitles.length} unique titles`)

const outPath = values.out ?? '__tests__/fixtures/amazon/all.json'
await Bun.write(outPath, JSON.stringify(allTitles, null, 2) + '\n')
console.log(`Saved to ${outPath}`)
