import { BrowseEntitySchema } from '../../../schemas/providers/amazon.dto'
import type { Title } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { FETCH_HEADERS } from './detail'

const logger = getAppLogger('amazon')

const CHANNEL_BASE = 'https://www.amazon.co.jp/gp/video/channel'
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

const KNOWN_CHANNELS = [
  { id: '551005cf-1b44-435e-a2a2-bbc007ea37d2', label: 'dアニメストア' },
  { id: '0246cb84-8f43-4c17-ac1f-2bfe85893c23', label: 'アニメタイムズ' }, // label unverified
  { id: '7d67b406-2ce8-4b90-b06d-61214a6c7ec0', label: '東映アニメチャンネル' } // label unverified
] as const

/** Find the JSON substring bounded by matching braces starting at `start`. */
function extractObjectAt(html: string, start: number): string | null {
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = start; i < html.length; i++) {
    const c = html[i]
    if (inStr) {
      if (esc) esc = false
      else if (c === '\\') esc = true
      else if (c === '"') inStr = false
      continue
    }
    if (c === '"') inStr = true
    else if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return html.substring(start, i + 1)
    }
  }
  return null
}

/** Locate the 新着 carousel object in the HTML and return the JSON string. */
function findShinchakuCarousel(html: string): string | null {
  const needle = '"title":"新着"'
  let idx = 0
  for (;;) {
    const found = html.indexOf(needle, idx)
    if (found === -1) return null
    const ctIdx = html.lastIndexOf('"containerType":"StandardCarousel"', found)
    if (ctIdx !== -1) {
      const objStart = html.lastIndexOf('{', ctIdx)
      if (objStart !== -1) {
        const obj = extractObjectAt(html, objStart)
        if (obj?.includes('"title":"新着"')) return obj
      }
    }
    idx = found + needle.length
  }
}

type PaginationInfo = {
  targetId: string
  serviceToken: string
  startIndex: number
}

function extractPagination(obj: Record<string, unknown>): PaginationInfo | null {
  const targetId = (obj.paginationTargetId as string | undefined) ?? ''
  const serviceToken = (obj.paginationServiceToken as string | undefined) ?? ''
  const startIndex = typeof obj.paginationStartIndex === 'number' ? obj.paginationStartIndex : 20
  if (!targetId || !serviceToken) return null
  return { targetId, serviceToken, startIndex }
}

function extractInitialEntities(obj: Record<string, unknown>): Record<string, unknown>[] {
  // Entities live in obj.entities or nested under containers/items
  const direct = obj.entities
  if (Array.isArray(direct)) return direct as Record<string, unknown>[]

  // Fallback: look for items array (some carousel shapes)
  const items = obj.items
  if (Array.isArray(items)) return items as Record<string, unknown>[]

  return []
}

async function paginateChannel(
  targetId: string,
  serviceToken: string,
  startIndex: number,
  cookie: string
): Promise<{ entities: Record<string, unknown>[]; hasMoreItems: boolean }> {
  const url = new URL(PAGINATE_BASE)
  url.searchParams.set('pageType', 'channel')
  url.searchParams.set('pageId', 'channel')
  url.searchParams.set('collectionType', 'Container')
  url.searchParams.set('paginationTargetId', targetId)
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
  if (!res.ok) throw new Error(`paginateChannel error: ${res.status} ${res.statusText}`)
  const data = (await res.json()) as { entities?: unknown; hasMoreItems?: unknown }
  const entities = Array.isArray(data.entities) ? (data.entities as Record<string, unknown>[]) : []
  const hasMoreItems = typeof data.hasMoreItems === 'boolean' ? data.hasMoreItems : false
  return { entities, hasMoreItems }
}

/**
 * Fetch the 新着 carousel from a Prime Video channel page and return all titles,
 * paginating until exhausted or the 20-page safety cap is hit.
 */
export async function fetchChannelNewArrivals(channelId: string): Promise<Title[]> {
  logger.info({ action: 'channel-fetch-start', channelId })

  const channelUrl = `${CHANNEL_BASE}/${channelId}`
  let htmlRes: Response
  try {
    htmlRes = await fetch(channelUrl, { headers: { ...FETCH_HEADERS, Accept: 'text/html' } })
  } catch (e) {
    logger.error({ action: 'channel-fetch-error', channelId, error: e instanceof Error ? e.message : String(e) })
    return []
  }

  if (!htmlRes.ok) {
    logger.warn({ action: 'channel-fetch-non2xx', channelId, status: htmlRes.status })
    return []
  }

  const cookie = htmlRes.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ')
  const html = await htmlRes.text()

  const carouselJson = findShinchakuCarousel(html)
  if (!carouselJson) {
    logger.warn({ action: 'channel-carousel-not-found', channelId })
    return []
  }

  let carousel: Record<string, unknown>
  try {
    carousel = JSON.parse(carouselJson) as Record<string, unknown>
  } catch (e) {
    logger.error({
      action: 'channel-carousel-parse-error',
      channelId,
      error: e instanceof Error ? e.message : String(e)
    })
    return []
  }

  const seen = new Set<string>()
  const titles: Title[] = []
  let skipped = 0

  const processEntities = (entities: Record<string, unknown>[]) => {
    for (const entity of entities) {
      const parsed = BrowseEntitySchema.safeParse(entity)
      if (!parsed.success) {
        skipped++
        continue
      }
      const title = parsed.data
      if (seen.has(title.contentId)) continue
      seen.add(title.contentId)
      titles.push(title)
    }
  }

  // Process initial entities embedded in the carousel object
  processEntities(extractInitialEntities(carousel))

  // Paginate for remaining items
  const pag = extractPagination(carousel)
  if (!pag) {
    logger.info({ action: 'channel-fetch-done', channelId, count: titles.length, skipped, pages: 0 })
    return titles
  }

  let startIndex = pag.startIndex
  let page = 0
  const MAX_PAGES = 20

  for (;;) {
    let result: { entities: Record<string, unknown>[]; hasMoreItems: boolean }
    try {
      result = await paginateChannel(pag.targetId, pag.serviceToken, startIndex, cookie)
    } catch (e) {
      logger.warn({
        action: 'channel-paginate-error',
        channelId,
        page,
        startIndex,
        error: e instanceof Error ? e.message : String(e)
      })
      break
    }

    if (result.entities.length === 0) break
    page++

    processEntities(result.entities)

    logger.debug({
      action: 'channel-paginate-page',
      channelId,
      page,
      startIndex,
      fetched: result.entities.length,
      hasMore: result.hasMoreItems
    })

    if (!result.hasMoreItems) break
    startIndex += result.entities.length
    if (page >= MAX_PAGES) {
      logger.warn({ action: 'channel-paginate-safety-break', channelId, page })
      break
    }
  }

  logger.info({ action: 'channel-fetch-done', channelId, count: titles.length, skipped, pages: page })
  return titles
}

/**
 * Fetch 新着 titles from all known Prime Video channels in parallel,
 * union and dedupe by contentId.
 */
export async function fetchAllChannelNewArrivals(): Promise<Title[]> {
  logger.info({ action: 'channel-fetch-all-start', channels: KNOWN_CHANNELS.length })

  const results = await Promise.allSettled(
    KNOWN_CHANNELS.map(async (ch) => {
      const titles = await fetchChannelNewArrivals(ch.id)
      logger.info({ action: 'channel-result', label: ch.label, channelId: ch.id, count: titles.length })
      return titles
    })
  )

  const seen = new Set<string>()
  const all: Title[] = []
  for (const result of results) {
    if (result.status === 'rejected') {
      logger.error({
        action: 'channel-fetch-all-rejected',
        error: result.reason instanceof Error ? result.reason.message : String(result.reason)
      })
      continue
    }
    for (const title of result.value) {
      if (seen.has(title.contentId)) continue
      seen.add(title.contentId)
      all.push(title)
    }
  }

  logger.info({ action: 'channel-fetch-all-done', total: all.length })
  return all
}
