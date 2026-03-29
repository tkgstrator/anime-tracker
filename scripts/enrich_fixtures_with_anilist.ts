/**
 * Hulu / Amazon の個別フィクスチャ JSON を読み込み、
 * AniList API で title を識別して anilistId / title / status / year / quarter を書き戻す。
 *
 * 50件ずつバッチで処理し、キャッシュ (.cache/<provider>/anilist_mapping.json) に結果を保存して
 * 再実行時に重複リクエストを避ける。
 *
 * Usage:
 *   bun scripts/enrich_fixtures_with_anilist.ts
 */
import { readdirSync } from 'node:fs'
import { mkdirSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { cleanTitle, AniListAdapter } from '../src/lib/metadata/anilist'

// AniList の query complexity 上限 (500) に収まるようバッチサイズを制限
const BATCH_SIZE = 30
const CACHE_DIR = '.cache'

// --- Types ---

interface FixtureEntry {
  filePath: string
  provider: string
  contentId: string
  title: string
  entityType?: string
}

interface AniListCacheEntry {
  id: number
  nativeTitle: string
  status: string
  year: number
  quarter: number
}

interface AniListCache {
  [key: string]: AniListCacheEntry | null
}

// --- Helpers ---

function progress(msg: string) {
  process.stdout.write(`\r\x1b[K${msg}`)
}

const shouldSkip = (title: string, entityType?: string) =>
  entityType === 'movie' ||
  /舞台|THE STAGE|\bSTAGE\b|ステージ|\bMUSICAL\b|ミュージカル|朗読劇|\bLIVE\b|ライブ|コンサート|フェス|公演|イベント/i.test(title)

async function loadCache(provider: string): Promise<AniListCache> {
  const file = Bun.file(`${CACHE_DIR}/${provider}/anilist_mapping.json`)
  if (await file.exists()) return file.json()
  return {}
}

async function saveCache(provider: string, cache: AniListCache): Promise<void> {
  await Bun.write(`${CACHE_DIR}/${provider}/anilist_mapping.json`, JSON.stringify(cache, null, 2) + '\n')
}

// --- Fixture loading ---

function loadFixtureEntries(provider: string, dir: string): FixtureEntry[] {
  const files = readdirSync(dir).filter((f) => f.endsWith('.json'))
  const entries: FixtureEntry[] = []

  for (const file of files) {
    const filePath = resolve(dir, file)
    const contentId = basename(file, '.json')
    try {
      const data = JSON.parse(require('node:fs').readFileSync(filePath, 'utf-8'))
      entries.push({
        filePath,
        provider,
        contentId,
        title: data.title,
        entityType: data.entityType
      })
    } catch {
      // skip malformed files
    }
  }
  return entries
}

// --- Main ---

const adapter = new AniListAdapter()

async function processProvider(provider: string, fixtureDir: string) {
  const entries = loadFixtureEntries(provider, fixtureDir)
  const cache = await loadCache(provider)

  console.log(`\n${'='.repeat(60)}`)
  console.log(`[${provider}] ${entries.length} fixtures, ${Object.keys(cache).length} cached`)
  console.log('='.repeat(60))

  // Filter: skip movies/events, already cached
  const toProcess = entries.filter((e) => !(e.contentId in cache) && !shouldSkip(e.title, e.entityType))
  const alreadyCached = entries.filter((e) => e.contentId in cache)

  console.log(`  To search: ${toProcess.length}, Already cached: ${alreadyCached.length}, Skipped: ${entries.length - toProcess.length - alreadyCached.length}`)

  // Batch AniList lookup (50件ずつ1リクエストにまとめる)
  const found = { count: 0 }
  const notFound = { count: 0 }

  for (const i of Array.from({ length: Math.ceil(toProcess.length / BATCH_SIZE) }, (_, k) => k * BATCH_SIZE)) {
    const batch = toProcess.slice(i, i + BATCH_SIZE)

    try {
      const results = await adapter.identifyBatch(batch.map((e) => e.title))
      for (const [j, entry] of batch.entries()) {
        const result = results[j]
        if (result) {
          cache[entry.contentId] = {
            id: result.aniListId!,
            nativeTitle: result.title,
            status: result.status,
            year: result.year,
            quarter: result.quarter
          }
          found.count++
        } else {
          cache[entry.contentId] = null
          notFound.count++
        }
      }
    } catch (e) {
      // 429 rate limit の場合はリトライ
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('429')) {
        console.log(`\n  Rate limited, waiting 60s...`)
        await new Promise((r) => setTimeout(r, 60_000))
        try {
          const results = await adapter.identifyBatch(batch.map((e) => e.title))
          for (const [j, entry] of batch.entries()) {
            const result = results[j]
            if (result) {
              cache[entry.contentId] = {
                id: result.aniListId!,
                nativeTitle: result.title,
                status: result.status,
                year: result.year,
                quarter: result.quarter
              }
              found.count++
            } else {
              cache[entry.contentId] = null
              notFound.count++
            }
          }
        } catch {
          console.log(`  Retry failed, skipping batch`)
          for (const entry of batch) {
            notFound.count++
          }
        }
      } else {
        console.log(`\n  Error: ${msg}`)
        for (const entry of batch) {
          notFound.count++
        }
      }
    }

    const done = Math.min(i + BATCH_SIZE, toProcess.length)
    progress(`[${provider}] ${done}/${toProcess.length} — found: ${found.count}, not found: ${notFound.count}`)

    // Save cache periodically
    if (done % (BATCH_SIZE * 5) === 0 || done === toProcess.length) {
      await saveCache(provider, cache)
    }
  }

  if (toProcess.length > 0) console.log('')
  console.log(`  AniList result: ${found.count} found, ${notFound.count} not found`)
  await saveCache(provider, cache)

  // Apply metadata to fixture files
  console.log(`\n[${provider}] Applying metadata to fixture files...`)
  let applied = 0
  let skipped = 0

  for (const entry of entries) {
    if (shouldSkip(entry.title, entry.entityType)) {
      skipped++
      continue
    }

    const cached = cache[entry.contentId]
    if (!cached) {
      skipped++
      continue
    }

    const data = JSON.parse(require('node:fs').readFileSync(entry.filePath, 'utf-8'))
    const changed =
      data.anilistId !== cached.id ||
      data.title !== cached.nativeTitle ||
      data.status !== cached.status ||
      data.year !== cached.year ||
      data.quarter !== cached.quarter

    if (!changed) {
      skipped++
      continue
    }

    data.anilistId = cached.id
    data.title = cached.nativeTitle
    data.status = cached.status
    data.year = cached.year
    data.quarter = cached.quarter

    await Bun.write(entry.filePath, JSON.stringify(data, null, 2) + '\n')
    applied++
  }

  console.log(`  Applied: ${applied}, Skipped: ${skipped}`)

  // Save not-found list
  const notFoundList = entries
    .filter((e) => cache[e.contentId] === null && !shouldSkip(e.title, e.entityType))
    .map((e) => ({ contentId: e.contentId, originalTitle: e.title, cleaned: cleanTitle(e.title) }))
    .sort((a, b) => a.originalTitle.localeCompare(b.originalTitle, 'ja'))
  await Bun.write(`${CACHE_DIR}/${provider}/anilist_not_found.json`, JSON.stringify(notFoundList, null, 2) + '\n')
  console.log(`  Not found list: ${notFoundList.length} → ${CACHE_DIR}/${provider}/anilist_not_found.json`)
}

// --- Run ---

for (const dir of ['amazon', 'hulu', 'crunchyroll']) {
  mkdirSync(`${CACHE_DIR}/${dir}`, { recursive: true })
}

await processProvider('hulu', '__tests__/fixtures/hulu/titles')
await processProvider('amazon', '__tests__/fixtures/amazon/episodes_refetched')
await processProvider('crunchyroll', '__tests__/fixtures/crunchyroll/episodes_refetched')

console.log('\nDone!')
