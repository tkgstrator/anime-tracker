/**
 * AmazonProvider の並列取得テスト + 生APIレスポンスの詳細フィールド確認スクリプト。
 *
 * Usage: bun run scripts/amazon_parallel_test.ts
 */
import { buildPaginationToken } from '../src/lib/providers/amazon/browse'
import { FETCH_HEADERS } from '../src/lib/providers/amazon/detail'

const PAGINATE_BASE = 'https://www.amazon.co.jp/gp/video/api/paginateCollection'
const DYNAMIC_FEATURES = [
  'integration', 'CLIENT_DECORATION_ENABLE_DAAPI', 'ENABLE_DRAPER_CONTENT',
  'HorizontalPagination', 'CleanSlate', 'EpgContainerPagination', 'ENABLE_GPCI',
  'SupportsImageTextLinkTextInStandardHero', 'Remaster', 'SupportsChannelWidget',
  'PromotionalBannerSupported', 'RemoveFromContinueWatching', 'SearchChannelBundles',
  'SupportChannelItemDecoration', 'TvodMovieBundles'
]

async function getCookie(): Promise<string> {
  const res = await fetch('https://www.amazon.co.jp/gp/video/', {
    headers: FETCH_HEADERS, redirect: 'manual'
  })
  return res.headers.getSetCookie().map(c => c.split(';')[0]).join('; ')
}

async function paginate(token: string, startIndex: number, cookie: string) {
  const url = new URL(PAGINATE_BASE)
  url.searchParams.set('jic', '8|EgRzdm9k')
  url.searchParams.set('pageType', 'browse')
  url.searchParams.set('pageId', 'default')
  url.searchParams.set('collectionType', 'Container')
  url.searchParams.set('paginationTargetId', 'default')
  url.searchParams.set('serviceToken', token)
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
    headers: { ...FETCH_HEADERS, Cookie: cookie, Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }
  })
  return res.json() as Promise<{ entities: Record<string, unknown>[]; hasMoreItems: boolean }>
}

interface RawTitle {
  titleID: string
  displayTitle: string
  releaseYear: string
  entityType: string
  highValueMessage: string
  titleMetadataBadge: string
}

function extractRaw(entity: Record<string, unknown>): RawTitle {
  const cues = entity.entitlementCues as Record<string, Record<string, string>> | undefined
  return {
    titleID: String(entity.titleID ?? ''),
    displayTitle: String(entity.displayTitle ?? ''),
    releaseYear: String(entity.releaseYear ?? ''),
    entityType: String(entity.entityType ?? ''),
    highValueMessage: cues?.highValueMessage?.message ?? '',
    titleMetadataBadge: cues?.titleMetadataBadge?.message ?? '',
  }
}

async function testMode(label: string, buildOptions: Parameters<typeof buildPaginationToken>[0]) {
  const start = performance.now()
  const cookie = await getCookie()
  const token = buildPaginationToken(buildOptions)

  // 全ページ順次取得（生データ保持）
  const allEntities: RawTitle[] = []
  const seen = new Set<string>()
  let startIndex = 0
  let hasMore = true

  while (hasMore) {
    const page = await paginate(token, startIndex, cookie)
    if (page.entities.length === 0) break
    for (const e of page.entities) {
      const raw = extractRaw(e)
      if (!seen.has(raw.titleID)) {
        seen.add(raw.titleID)
        allEntities.push(raw)
      }
    }
    startIndex += page.entities.length
    hasMore = page.hasMoreItems
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2)
  console.log(`\n[${label}] ${allEntities.length} unique titles in ${elapsed}s`)
  console.log('-'.repeat(80))

  // 全件表示（リリース年 + タイトル + バッジ情報）
  for (const t of allEntities) {
    const badges = [
      t.titleMetadataBadge ? `badge:${t.titleMetadataBadge}` : '',
      t.highValueMessage ? `hvm:${t.highValueMessage}` : '',
    ].filter(Boolean).join(' ')
    console.log(`  ${t.releaseYear.padEnd(6)} ${t.titleID}  ${t.displayTitle}${badges ? `  [${badges}]` : ''}`)
  }

  return { label, count: allEntities.length, elapsed }
}

async function main() {
  console.log('=== Amazon Parallel Pagination Test (Raw) ===')

  const results = []
  results.push(await testMode('newAnime', { newAnime: true }))
  results.push(await testMode('expiring', { expiring: true }))
  results.push(await testMode('all', undefined))

  console.log('\n=== Summary ===')
  for (const r of results) {
    console.log(`  ${r.label}: ${r.count} titles — ${r.elapsed}s`)
  }
}

main().catch(console.error)
