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
  'HERO_IMAGE_OPTIONAL',
  'RemoveFromContinueWatching',
  'ENABLE_CSIR',
  'SearchChannelBundles',
  'LinearStationsInHero',
  'LinearStationInAllCarousels',
  'SupportChannelItemDecoration',
  'TvodMovieBundles'
]

const KNOWN_CHANNELS = [
  { id: '551005cf-1b44-435e-a2a2-bbc007ea37d2', label: 'アニメタイムズ' },
  { id: '0246cb84-8f43-4c17-ac1f-2bfe85893c23', label: 'dアニメストア' },
  { id: '7d67b406-2ce8-4b90-b06d-61214a6c7ec0', label: '東映アニメチャンネル' }
] as const

/** Page size of the channel paginateCollection response (server-enforced). */
const PAGE_SIZE = 40
/** Hard cap on parallel paginate calls per channel (safety against runaway tokens). */
const MAX_PARALLEL_PAGES = 20

/**
 * Walk matched braces to extract a JSON object literal starting at `start`.
 * Implemented as a single pass with a mutable state object to avoid `let`.
 */
function extractObjectAt(html: string, start: number): string | null {
  const state = { depth: 0, inStr: false, esc: false, out: '', done: false }
  for (const c of html.substring(start)) {
    if (state.done) break
    state.out += c
    if (state.inStr) {
      if (state.esc) state.esc = false
      else if (c === '\\') state.esc = true
      else if (c === '"') state.inStr = false
      continue
    }
    if (c === '"') state.inStr = true
    else if (c === '{') state.depth += 1
    else if (c === '}') {
      state.depth -= 1
      if (state.depth === 0) state.done = true
    }
  }
  return state.done ? state.out : null
}

/**
 * Locate the "新着" StandardCarousel object embedded in the channel HTML,
 * recursively scanning forward past false positives.
 */
function findShinchakuCarousel(html: string): string | null {
  const needle = '"title":"新着"'
  const search = (fromIdx: number): string | null => {
    const found = html.indexOf(needle, fromIdx)
    if (found === -1) return null
    const ctIdx = html.lastIndexOf('"containerType":"StandardCarousel"', found)
    if (ctIdx !== -1) {
      const objStart = html.lastIndexOf('{', ctIdx)
      if (objStart !== -1) {
        const obj = extractObjectAt(html, objStart)
        if (obj?.includes('"title":"新着"')) return obj
      }
    }
    return search(found + needle.length)
  }
  return search(0)
}

/**
 * Extract the `journeyIngressContext` (jic) value from the first carousel
 * entity's link URL. The jic encodes the subscription/benefit filter context
 * (e.g. "danime/subscription") and is required for paginateCollection to
 * return the same filtered Recently Added feed the channel home page shows.
 */
function extractJic(obj: Record<string, unknown>): string | null {
  const entities = obj.entities as Record<string, unknown>[] | undefined
  if (!Array.isArray(entities)) return null
  const first = entities.find((e) => {
    const link = (e.link as { url?: string } | undefined)?.url
    return typeof link === 'string' && link.includes('jic=')
  })
  if (!first) return null
  const link = (first.link as { url?: string }).url ?? ''
  const m = link.match(/[?&]jic=([^&]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

type PaginationInfo = {
  targetId: string
  serviceToken: string
  startIndex: number
  /** Total entity count encoded in the token's cursor JSON (null if unavailable). */
  totalSize: number | null
}

/**
 * Decode a `v0_<base64url>` serviceToken and read `cursize` from the cursor
 * JSON embedded in its protobuf payload. cursize equals the total number of
 * entries the channel's Recently Added feed will serve.
 */
function extractCursize(serviceToken: string): number | null {
  if (!serviceToken.startsWith('v0_')) return null
  const b64 = serviceToken.slice(3).replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  const m = text.match(/"cursize"\s*:\s*(\d+)/)
  return m ? Number(m[1]) : null
}

function extractPagination(obj: Record<string, unknown>): PaginationInfo | null {
  const targetId = typeof obj.paginationTargetId === 'string' ? obj.paginationTargetId : ''
  const serviceToken = typeof obj.paginationServiceToken === 'string' ? obj.paginationServiceToken : ''
  const startIndex = typeof obj.paginationStartIndex === 'number' ? obj.paginationStartIndex : 20
  if (!targetId || !serviceToken) return null
  return { targetId, serviceToken, startIndex, totalSize: extractCursize(serviceToken) }
}

type PaginateResult = {
  entities: Record<string, unknown>[]
  hasMoreItems: boolean
  nextServiceToken: string | null
}

async function paginateChannel(
  channelId: string,
  targetId: string,
  serviceToken: string,
  startIndex: number,
  jic: string
): Promise<PaginateResult> {
  const url = new URL(PAGINATE_BASE)
  url.searchParams.set('pageType', 'channel')
  url.searchParams.set('pageId', `amzn1.dv.channel.${channelId}`)
  url.searchParams.set('collectionType', 'Container')
  url.searchParams.set('paginationTargetId', targetId)
  url.searchParams.set('serviceToken', serviceToken)
  url.searchParams.set('startIndex', String(startIndex))
  url.searchParams.set('actionScheme', 'default')
  url.searchParams.set('payloadScheme', 'default')
  url.searchParams.set('decorationScheme', 'web-decoration-asin-v4')
  url.searchParams.set('featureScheme', 'web-features-v6')
  for (const f of DYNAMIC_FEATURES) url.searchParams.append('dynamicFeatures', f)
  url.searchParams.set('widgetScheme', 'web-explore-v33')
  url.searchParams.set('variant', 'desktopOSX')
  url.searchParams.set('journeyIngressContext', jic)

  const res = await fetch(url.toString(), {
    headers: { ...FETCH_HEADERS, Accept: '*/*', 'X-Requested-With': 'XMLHttpRequest' }
  })
  if (!res.ok) throw new Error(`paginateChannel ${res.status} ${res.statusText}`)

  const data = (await res.json()) as {
    entities?: unknown
    hasMoreItems?: unknown
    pagination?: { queryParameters?: { serviceToken?: unknown } }
  }
  const entities = Array.isArray(data.entities) ? (data.entities as Record<string, unknown>[]) : []
  const hasMoreItems = typeof data.hasMoreItems === 'boolean' ? data.hasMoreItems : false
  const nextServiceToken =
    typeof data.pagination?.queryParameters?.serviceToken === 'string'
      ? (data.pagination.queryParameters.serviceToken as string)
      : null
  return { entities, hasMoreItems, nextServiceToken }
}

/**
 * Fan out paginateChannel calls in parallel using the initial HTML token.
 * The server accepts the same initial serviceToken for any startIndex, so we
 * can compute the exact page count from the token's cursize and fire them
 * all at once. Falls back to MAX_PARALLEL_PAGES when cursize is unavailable.
 */
async function collectPaginated(
  channelId: string,
  targetId: string,
  jic: string,
  pagination: PaginationInfo,
  collector: Record<string, unknown>[]
): Promise<void> {
  const remaining =
    pagination.totalSize != null
      ? Math.max(0, pagination.totalSize - pagination.startIndex)
      : MAX_PARALLEL_PAGES * PAGE_SIZE
  const pageCount = Math.min(Math.ceil(remaining / PAGE_SIZE), MAX_PARALLEL_PAGES)
  if (pageCount === 0) return

  const startIndexes = Array.from({ length: pageCount }, (_, i) => pagination.startIndex + i * PAGE_SIZE)
  logger.debug({
    action: 'channel-paginate-fanout',
    channelId,
    totalSize: pagination.totalSize,
    pageCount,
    startIndexes
  })

  const results = await Promise.all(
    startIndexes.map((startIndex) =>
      paginateChannel(channelId, targetId, pagination.serviceToken, startIndex, jic).catch((e) => {
        logger.warn({
          action: 'channel-paginate-error',
          channelId,
          startIndex,
          error: e instanceof Error ? e.message : String(e)
        })
        return null
      })
    )
  )
  for (const result of results) {
    if (!result) continue
    for (const entity of result.entities) collector.push(entity)
  }
}

/** JSON.parse wrapped in a safe IIFE so we can avoid `let` around the try. */
function safeParseObject(json: string): Record<string, unknown> | null {
  try {
    return JSON.parse(json) as Record<string, unknown>
  } catch (e) {
    logger.warn({ action: 'json-parse-failed', error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/** Fetch with null-on-error so a try/catch let is not required at the call site. */
async function fetchOrNull(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, init)
  } catch (e) {
    logger.warn({ action: 'fetch-failed', url, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/**
 * Fetch the "新着" (Recently Added) feed from a Prime Video channel page.
 *
 * The channel home HTML embeds the first ~20 carousel entries plus a
 * paginationTargetId + serviceToken. To make paginateCollection return the
 * same filtered Recently Added stream the channel shows (and not the full
 * channel catalog), we pass `pageId=amzn1.dv.channel.<uuid>` together with
 * the `journeyIngressContext` jic that the channel itself uses — both are
 * extracted from the HTML. Cookies are not required.
 *
 * Titles without a `NEW_EPISODE` / `RECENTLY_ADDED` badge are promoted to
 * `NEW_EPISODE`, since Amazon has already filtered the stream to Recently
 * Added via the jic parameter.
 */
export async function fetchChannelNewArrivals(channelId: string): Promise<Title[]> {
  logger.info({ action: 'channel-fetch-start', channelId })

  const channelUrl = `${CHANNEL_BASE}/${channelId}`
  const htmlRes = await fetchOrNull(channelUrl, { headers: { ...FETCH_HEADERS, Accept: 'text/html' } })
  if (!htmlRes) {
    logger.error({ action: 'channel-fetch-error', channelId })
    return []
  }
  if (!htmlRes.ok) {
    logger.warn({ action: 'channel-fetch-non2xx', channelId, status: htmlRes.status })
    return []
  }
  const html = await htmlRes.text()

  const carouselJson = findShinchakuCarousel(html)
  if (!carouselJson) {
    logger.warn({ action: 'channel-carousel-not-found', channelId })
    return []
  }

  const carousel = safeParseObject(carouselJson)
  if (!carousel) {
    logger.error({ action: 'channel-carousel-parse-error', channelId })
    return []
  }

  const jic = extractJic(carousel)
  if (!jic) {
    logger.warn({ action: 'channel-jic-not-found', channelId })
  }

  // Collect raw entities: initial (HTML-embedded) + paginated (API).
  const initialEntities = Array.isArray(carousel.entities) ? (carousel.entities as Record<string, unknown>[]) : []
  const rawEntities: Record<string, unknown>[] = [...initialEntities]

  const pag = extractPagination(carousel)
  if (pag && jic) {
    await collectPaginated(channelId, pag.targetId, jic, pag, rawEntities)
  }

  // Classify each raw entity as kept or skipped (immutable map).
  // Everything that survives paginateCollection with the channel jic is part
  // of Amazon's Recently Added feed, so a missing badge is promoted to
  // NEW_EPISODE unconditionally.
  type Result = { kept: true; title: Title } | { kept: false }
  const classified: Result[] = rawEntities.map((entity) => {
    const parsed = BrowseEntitySchema.safeParse(entity)
    if (!parsed.success) return { kept: false }
    const title = parsed.data
    if (title.badge == null) title.badge = 'NEW_EPISODE'
    return { kept: true, title }
  })

  // Dedupe by contentId while preserving first-seen order.
  const seen = new Set<string>()
  const titles: Title[] = []
  for (const r of classified) {
    if (!r.kept) continue
    if (seen.has(r.title.contentId)) continue
    seen.add(r.title.contentId)
    titles.push(r.title)
  }

  const skipped = classified.filter((r) => !r.kept).length
  logger.info({
    action: 'channel-fetch-done',
    channelId,
    count: titles.length,
    skipped,
    rawCount: rawEntities.length
  })
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
