/**
 * p_n_ways_to_watch (あり/なし) × p_n_subscription_id (なし/単体/両方) の
 * 全8パターンで newAnime ブラウズ結果の件数を比較し、
 * 各パターン固有のタイトルをID・タイトル名付きでレポートするスクリプト。
 *
 * Usage: bun run scripts/amazon_newanime_params_test.ts
 */
import { parseBrowseHtml } from '../src/lib/providers/amazon'
import { FETCH_HEADERS, htmlUnescape } from '../src/lib/providers/amazon/detail'
import { encodeBytes, encodeString, encodeVarintField } from '../src/lib/providers/amazon/protobuf'

const AMAZON_BROWSE_BASE = 'https://www.amazon.co.jp/gp/video/browse/ref=atv_dp_pd_gen'
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
  'TvodMovieBundles',
]

const BQ_FILTER =
  "(and (and (and (and (or genre:'av_genre_anime' genre:'av_subgenre_anime*') " +
  "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
  "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
  "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
  "(not entity_type:'Promotion|Trailer|Bonus Content'))"

interface TitleEntry {
  contentId: string
  title: string
  hasNewContent: boolean
  hasExpiring: boolean
}

interface Combination {
  label: string
  pNWaysToWatch: string | null
  pNSubscriptionId: string | null
}

const P_N_WAYS_VALUES: (string | null)[] = [null, '3746328051']
const P_N_SUB_VALUES: (string | null)[] = [null, '5602560051', '10387742051', '5602560051|10387742051']

const COMBINATIONS: Combination[] = P_N_WAYS_VALUES.flatMap((ways) =>
  P_N_SUB_VALUES.map((sub) => ({
    label: `p_n_ways=${ways ?? 'なし'} / p_n_sub=${sub ?? 'なし'}`,
    pNWaysToWatch: ways,
    pNSubscriptionId: sub,
  })),
)

function buildSearchParams(combo: Combination): string {
  const entries: [string, string][] = [
    ['p_n_theme_browse-bin', '4435524051'],
    ['is_movie_collection', '0,0,0,0'],
    ['sort', '-prime_video_start_date'],
    ['field-ways_to_watch', '3746330051'],
    ['p_n_entity_type', '4174099051'],
    ['search-alias', 'instant-video'],
    ['bq', BQ_FILTER],
  ]
  if (combo.pNWaysToWatch) {
    entries.push(['p_n_ways_to_watch', combo.pNWaysToWatch])
  }
  if (combo.pNSubscriptionId) {
    entries.push(['p_n_subscription_id', combo.pNSubscriptionId])
  }
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

function buildToken(combo: Combination): string {
  const searchParams = buildSearchParams(combo)
  const nested = [
    ...encodeString(3, searchParams),
    ...encodeString(4, ''),
    ...encodeVarintField(6, 0),
    ...encodeVarintField(10, 0),
    ...encodeVarintField(14, 0),
  ]
  const proto = [
    ...encodeString(2, 'query'),
    ...encodeVarintField(3, 1),
    ...encodeString(5, 'default'),
    ...encodeString(6, 'center'),
    ...encodeString(7, 'search'),
    ...encodeString(15, ''),
    ...encodeBytes(16, nested),
  ]
  const bytes = new Uint8Array(proto)
  const b64 = btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_')
}

function extractPaginationParams(html: string): { paginationTargetId: string; serviceToken: string } | null {
  const targetMatch = html.match(/"paginationTargetId"\s*:\s*"([^"]+)"/)
  const tokenMatch = html.match(/"paginationServiceToken"\s*:\s*"(v0_[^"]+)"/)
  if (!targetMatch || !tokenMatch) return null
  return { paginationTargetId: targetMatch[1], serviceToken: tokenMatch[1] }
}

async function paginateCollection(
  paginationTargetId: string,
  serviceToken: string,
  startIndex: number,
  cookie: string,
): Promise<{ entities: Record<string, unknown>[]; hasMoreItems: boolean; pagination?: { queryParameters?: { serviceToken?: string } } }> {
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
    headers: { ...FETCH_HEADERS, Cookie: cookie, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
  })
  if (!res.ok) throw new Error(`paginateCollection error: ${res.status}`)
  return res.json() as Promise<any>
}

async function fetchAllForCombination(combo: Combination): Promise<{ count: number; titles: TitleEntry[]; elapsedMs: number }> {
  const startTime = performance.now()
  const token = buildToken(combo)
  const browseUrl = `${AMAZON_BROWSE_BASE}?serviceToken=v0_${encodeURIComponent(token)}`

  console.log(`\n--- ${combo.label} ---`)

  const browseRes = await fetch(browseUrl, { headers: FETCH_HEADERS })
  if (!browseRes.ok) {
    console.error(`  Browse page error: ${browseRes.status}`)
    return { count: 0, titles: [], elapsedMs: performance.now() - startTime }
  }

  const setCookies = browseRes.headers.getSetCookie()
  const cookie = setCookies.map((c) => c.split(';')[0]).join('; ')
  const html = await browseRes.text()

  const initialEntries = parseBrowseHtml(html)
  const seen = new Set<string>()
  const titles: TitleEntry[] = []
  for (const entry of initialEntries) {
    if (!seen.has(entry.contentId)) {
      seen.add(entry.contentId)
      titles.push({
        contentId: entry.contentId,
        title: entry.title,
        hasNewContent: entry.hasNewContent ?? false,
        hasExpiring: !!entry.expiring,
      })
    }
  }
  console.log(`  Initial: ${initialEntries.length} items`)

  const paginationParams = extractPaginationParams(html)
  if (paginationParams) {
    let currentToken = paginationParams.serviceToken
    let startIndex = initialEntries.length

    while (true) {
      // await new Promise((r) => setTimeout(r, 300))
      try {
        const res = await paginateCollection(paginationParams.paginationTargetId, currentToken, startIndex, cookie)
        const entities = res.entities ?? []

        for (const e of entities) {
          const titleId = e.titleID as string
          const displayTitle = e.displayTitle as string | undefined
          if (titleId && !seen.has(titleId)) {
            seen.add(titleId)
            const cues = e.entitlementCues as { titleMetadataBadge?: { message?: string }; highValueMessage?: { message?: string } } | undefined
            titles.push({
              contentId: titleId,
              title: displayTitle ? htmlUnescape(displayTitle) : '(unknown)',
              hasNewContent: !!cues?.titleMetadataBadge?.message,
              hasExpiring: !!cues?.highValueMessage?.message,
            })
          }
        }

        console.log(`  startIndex=${startIndex}: ${entities.length} items (total: ${titles.length})`)

        if (entities.length === 0 || !res.hasMoreItems) break

        const nextToken = res.pagination?.queryParameters?.serviceToken
        if (nextToken) currentToken = nextToken
        startIndex += entities.length
      } catch (err) {
        console.error(`  Error at startIndex=${startIndex}:`, err instanceof Error ? err.message : err)
        break
      }
    }
  }

  const elapsedMs = performance.now() - startTime
  console.log(`  Total: ${titles.length} titles (${(elapsedMs / 1000).toFixed(1)}s)`)
  return { count: titles.length, titles, elapsedMs }
}

// --- Main ---

interface Result {
  label: string
  count: number
  titles: TitleEntry[]
  elapsedMs: number
}

const results: Result[] = []
const fixturesDir = '__tests__/fixtures/amazon/newanime_params'
const { mkdirSync } = await import('node:fs')
mkdirSync(fixturesDir, { recursive: true })

for (const combo of COMBINATIONS) {
  if (results.length > 0) {
    // await new Promise((r) => setTimeout(r, 1000))
  }

  const { count, titles, elapsedMs } = await fetchAllForCombination(combo)
  results.push({ label: combo.label, count, titles, elapsedMs })

  const safeLabel = combo.label.replace(/[^a-zA-Z0-9_]/g, '_')
  await Bun.write(`${fixturesDir}/${safeLabel}.json`, JSON.stringify({ label: combo.label, count, titles }, null, 2) + '\n')
}

// --- タイトル名の逆引きマップ ---
const titleMap = new Map<string, string>()
for (const r of results) {
  for (const t of r.titles) {
    if (!titleMap.has(t.contentId) || titleMap.get(t.contentId) === '(unknown)') {
      titleMap.set(t.contentId, t.title)
    }
  }
}

// --- レポート ---
console.log('\n' + '='.repeat(90))
console.log('REPORT: p_n_ways_to_watch × p_n_subscription_id あり/なし 件数比較')
console.log('='.repeat(90))
console.log('')

const header = ['p_n_ways_to_watch', 'p_n_subscription_id', '件数', '新着EP', '配信終了', '所要時間']
  .map((h) => h.padEnd(26))
  .join('| ')
console.log(header)
console.log('-'.repeat(header.length))

for (const [i, r] of results.entries()) {
  const combo = COMBINATIONS[i]
  const newContentCount = r.titles.filter((t) => t.hasNewContent).length
  const expiringCount = r.titles.filter((t) => t.hasExpiring).length
  const row = [
    combo.pNWaysToWatch ?? '(なし)',
    combo.pNSubscriptionId ?? '(なし)',
    String(r.count),
    String(newContentCount),
    String(expiringCount),
    `${(r.elapsedMs / 1000).toFixed(1)}s`,
  ]
    .map((v) => v.padEnd(26))
    .join('| ')
  console.log(row)
}

const totalElapsed = results.reduce((sum, r) => sum + r.elapsedMs, 0)
console.log(`\n合計所要時間: ${(totalElapsed / 1000).toFixed(1)}s`)

// --- 各パターン固有タイトル ---
// --- 和集合 vs 最大パターン(882件)の比較 ---
console.log('\n' + '='.repeat(90))
console.log('和集合チェック: 全パターンの和集合 vs 最大件数パターン')
console.log('='.repeat(90))

const allUnion = new Map<string, TitleEntry>()
for (const r of results) {
  for (const t of r.titles) {
    if (!allUnion.has(t.contentId)) allUnion.set(t.contentId, t)
  }
}

const maxResult = results.reduce((a, b) => (a.count >= b.count ? a : b))
const maxSet = new Set(maxResult.titles.map((t) => t.contentId))
const missingFromMax = [...allUnion.values()].filter((t) => !maxSet.has(t.contentId))

console.log(`  全パターン和集合: ${allUnion.size}件`)
console.log(`  最大パターン (${maxResult.label}): ${maxResult.count}件`)
console.log(`  最大パターンに含まれないタイトル: ${missingFromMax.length}件`)

if (missingFromMax.length > 0) {
  console.log('')
  for (const t of missingFromMax) {
    const sources = results.filter((r) => r.titles.some((rt) => rt.contentId === t.contentId)).map((r) => r.label)
    console.log(`  ${t.contentId}  ${t.title}  [badge: new=${t.hasNewContent}, exp=${t.hasExpiring}]`)
    console.log(`    含まれるパターン: ${sources.join(', ')}`)
  }
}

// --- バッジなしタイトルの内訳 ---
console.log('\n' + '='.repeat(90))
console.log('バッジなしタイトル (hasNewContent=false かつ hasExpiring=false)')
console.log('='.repeat(90))

for (const r of results) {
  const noBadge = r.titles.filter((t) => !t.hasNewContent && !t.hasExpiring)
  console.log(`\n${r.label}: ${noBadge.length}件 / ${r.count}件 がバッジなし`)
}

console.log('\n' + '='.repeat(90))
console.log('各パターンにのみ含まれるタイトル (他のどのパターンにも含まれない)')
console.log('='.repeat(90))

const idSets = results.map((r) => new Set(r.titles.map((t) => t.contentId)))

for (const [i, r] of results.entries()) {
  const otherSets = idSets.filter((_, j) => j !== i)
  const uniqueIds = r.titles
    .map((t) => t.contentId)
    .filter((id) => otherSets.every((s) => !s.has(id)))

  console.log(`\n--- ${r.label} (${r.count}件中 ${uniqueIds.length}件が固有) ---`)
  if (uniqueIds.length === 0) {
    console.log('  (固有タイトルなし)')
  } else {
    for (const id of uniqueIds) {
      console.log(`  ${id}  ${titleMap.get(id) ?? '(unknown)'}`)
    }
  }
}

// --- ペアワイズ差分 ---
console.log('\n' + '='.repeat(90))
console.log('ペアワイズ差分分析')
console.log('='.repeat(90))

for (let i = 0; i < results.length; i++) {
  for (let j = i + 1; j < results.length; j++) {
    const onlyI = results[i].titles.filter((t) => !idSets[j].has(t.contentId))
    const onlyJ = results[j].titles.filter((t) => !idSets[i].has(t.contentId))
    const common = results[i].titles.filter((t) => idSets[j].has(t.contentId))

    console.log(`\n[${results[i].label}] vs [${results[j].label}]`)
    console.log(`  共通: ${common.length}, 前者のみ: ${onlyI.length}, 後者のみ: ${onlyJ.length}`)

    if (onlyI.length > 0 && onlyI.length <= 20) {
      console.log('  前者のみ:')
      for (const t of onlyI) {
        console.log(`    ${t.contentId}  ${titleMap.get(t.contentId) ?? t.title}`)
      }
    }
    if (onlyJ.length > 0 && onlyJ.length <= 20) {
      console.log('  後者のみ:')
      for (const t of onlyJ) {
        console.log(`    ${t.contentId}  ${titleMap.get(t.contentId) ?? t.title}`)
      }
    }
  }
}

// --- レポートJSON保存 ---
const reportData = {
  timestamp: new Date().toISOString(),
  summary: results.map((r, i) => ({
    pNWaysToWatch: COMBINATIONS[i].pNWaysToWatch,
    pNSubscriptionId: COMBINATIONS[i].pNSubscriptionId,
    count: r.count,
    newContentCount: r.titles.filter((t) => t.hasNewContent).length,
    expiringCount: r.titles.filter((t) => t.hasExpiring).length,
    elapsedMs: Math.round(r.elapsedMs),
    elapsedSec: Number((r.elapsedMs / 1000).toFixed(1)),
  })),
  uniquePerPattern: results.map((r, i) => {
    const otherSets = idSets.filter((_, j) => j !== i)
    const uniqueTitles = r.titles.filter((t) => otherSets.every((s) => !s.has(t.contentId)))
    return {
      label: r.label,
      uniqueCount: uniqueTitles.length,
      uniqueTitles,
    }
  }),
}
await Bun.write(`${fixturesDir}/report.json`, JSON.stringify(reportData, null, 2) + '\n')
console.log(`\nレポートを ${fixturesDir}/report.json に保存しました`)
