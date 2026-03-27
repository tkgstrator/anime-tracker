import { type CDPSession, type Page, expect, test } from 'playwright/test'

/**
 * 外部画像がブラウザの disk cache に保持されるかを検証する。
 *
 * CDP の Network.responseReceived で response.fromDiskCache / fromPrefetchCache を取得し、
 * memory cache と disk cache を区別する。
 */

const TEST_PAGES = [
  '/anime/61d715f2-9a41-5bdd-87c8-68d1a52928d2',
  '/anime/953ad4d5-4e59-50a0-a367-0cf4f3a82cdb'
]

type ImageLoad = {
  url: string
  encodedDataLength: number
  fromDiskCache: boolean
  fromMemoryCache: boolean
  source: 'disk' | 'memory' | 'network'
}

async function collectImageLoads(page: Page, path: string, baseURL: string): Promise<ImageLoad[]> {
  const cdp: CDPSession = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')

  const selfOrigin = new URL(baseURL).origin
  const requestMap = new Map<string, string>()
  const responseInfo = new Map<string, { fromDiskCache: boolean; fromPrefetchCache: boolean }>()
  const results: ImageLoad[] = []

  cdp.on('Network.requestWillBeSent', (params) => {
    if (params.type === 'Image') {
      requestMap.set(params.requestId, params.request.url)
    }
  })

  cdp.on('Network.responseReceived', (params) => {
    if (params.type === 'Image') {
      responseInfo.set(params.requestId, {
        fromDiskCache: params.response.fromDiskCache ?? false,
        fromPrefetchCache: params.response.fromPrefetchCache ?? false
      })
    }
  })

  cdp.on('Network.requestServedFromCache', (params) => {
    // memory cache の場合、このイベントが発火する
    const url = requestMap.get(params.requestId)
    if (url) {
      responseInfo.set(params.requestId, {
        ...(responseInfo.get(params.requestId) ?? { fromDiskCache: false, fromPrefetchCache: false }),
        fromDiskCache: false // requestServedFromCache は memory cache
      })
    }
  })

  cdp.on('Network.loadingFinished', (params) => {
    const requestUrl = requestMap.get(params.requestId)
    if (!requestUrl) return
    if (requestUrl.startsWith('data:')) return
    // 自ドメインの画像プロキシ (/api/img) は対象に含める
    const isSelfProxy = requestUrl.startsWith(selfOrigin) && requestUrl.includes('/api/img')
    if (requestUrl.startsWith(selfOrigin) && !isSelfProxy) return

    const info = responseInfo.get(params.requestId)
    const cached = params.encodedDataLength === 0
    const fromDiskCache = info?.fromDiskCache ?? false
    const fromMemoryCache = cached && !fromDiskCache

    results.push({
      url: requestUrl,
      encodedDataLength: params.encodedDataLength,
      fromDiskCache,
      fromMemoryCache,
      source: fromDiskCache ? 'disk' : fromMemoryCache ? 'memory' : 'network'
    })
  })

  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5_000)

  await cdp.detach()
  return results
}

function printSummary(label: string, loads: ImageLoad[]) {
  const disk = loads.filter((r) => r.source === 'disk').length
  const memory = loads.filter((r) => r.source === 'memory').length
  const network = loads.filter((r) => r.source === 'network').length
  console.log(`\n=== ${label}: ${loads.length} external images ===`)
  console.log(`  Disk cache:   ${disk}`)
  console.log(`  Memory cache: ${memory}`)
  console.log(`  Network:      ${network}`)
  for (const img of loads) {
    const tag = img.source === 'network' ? `${(img.encodedDataLength / 1024).toFixed(0)}KB` : img.source.toUpperCase()
    console.log(`  [${tag}] ${img.url.slice(0, 100)}`)
  }
}

test.describe('Image memory cache (same context)', () => {
  for (const pagePath of TEST_PAGES) {
    test(`images are cached within same context: ${pagePath}`, async ({ browser, baseURL }) => {
      const url = baseURL ?? 'http://localhost:25173'
      const context = await browser.newContext()
      const page = await context.newPage()

      const firstVisit = await collectImageLoads(page, pagePath, url)
      printSummary('1st load', firstVisit)

      // リロードして memory cache が効くか確認
      const secondVisit = await collectImageLoads(page, pagePath, url)
      printSummary('2nd load (reload)', secondVisit)

      await context.close()

      if (secondVisit.length > 0) {
        const memoryCount = secondVisit.filter((r) => r.source === 'memory').length
        const diskCount = secondVisit.filter((r) => r.source === 'disk').length
        console.log(`\n  Memory: ${memoryCount}, Disk: ${diskCount}, Total cached: ${memoryCount + diskCount}/${secondVisit.length}`)
      }
    })
  }
})

test.describe('Image disk cache', () => {
  for (const pagePath of TEST_PAGES) {
    test(`images are NOT disk-cached: ${pagePath}`, async ({ browser, baseURL }) => {
      const url = baseURL ?? 'http://localhost:25173'

      // --- Phase 1: キャッシュを温める ---
      const context1 = await browser.newContext()
      const page1 = await context1.newPage()
      const firstVisit = await collectImageLoads(page1, pagePath, url)
      printSummary('1st visit', firstVisit)
      await context1.close()

      // --- Phase 2: 新しいコンテキストで再訪問 ---
      const context2 = await browser.newContext()
      const page2 = await context2.newPage()
      const secondVisit = await collectImageLoads(page2, pagePath, url)
      printSummary('2nd visit', secondVisit)
      await context2.close()

      // 現状: disk cache が効かないことを確認
      expect(secondVisit.length, 'No images found on page').toBeGreaterThan(0)
      const diskCachedCount = secondVisit.filter((r) => r.source === 'disk').length
      expect(diskCachedCount, 'Expected no disk cache hits in current state').toBe(0)
    })
  }

  for (const pagePath of TEST_PAGES) {
    test.fixme(`images are disk-cached after improvement: ${pagePath}`, async ({ browser, baseURL }) => {
      // キャッシュ改善実装後に fixme を外す
      const url = baseURL ?? 'http://localhost:25173'

      const context1 = await browser.newContext()
      const page1 = await context1.newPage()
      await collectImageLoads(page1, pagePath, url)
      await context1.close()

      const context2 = await browser.newContext()
      const page2 = await context2.newPage()
      const secondVisit = await collectImageLoads(page2, pagePath, url)
      printSummary('2nd visit (after improvement)', secondVisit)
      await context2.close()

      const diskCachedCount = secondVisit.filter((r) => r.source === 'disk').length
      const cacheRate = diskCachedCount / secondVisit.length
      expect(cacheRate, `Disk cache hit rate too low: ${(cacheRate * 100).toFixed(1)}%`).toBeGreaterThan(0.5)
    })
  }
})
