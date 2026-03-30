/**
 * .cache/amazon-browse/titles.json を読み込み、
 * AniList API で50件ずつバッチ識別して titles_identified.json を生成する。
 *
 * キャッシュ (.cache/amazon-browse/anilist_mapping.json) に結果を保存し、
 * 再実行時は識別済みタイトルをスキップする。
 *
 * Usage:
 *   bun scripts/enrich/amazon_titles.ts
 */
import { mkdirSync } from 'node:fs'
import { cleanTitle, AniListAdapter } from '../../src/lib/metadata/anilist'
import type { Title } from '../../src/schemas/providers/common.dto'

// AniList の query complexity 上限 (500) に収まるようバッチサイズを制限
const BATCH_SIZE = 30
const CACHE_DIR = '.cache/amazon-browse'
const INPUT_PATH = `${CACHE_DIR}/titles.json`
const OUTPUT_PATH = `${CACHE_DIR}/titles_identified.json`
const OUTPUT_MOVIES_PATH = `${CACHE_DIR}/titles_identified_movies.json`
const MAPPING_PATH = `${CACHE_DIR}/anilist_mapping.json`
const NOT_FOUND_PATH = `${CACHE_DIR}/anilist_not_found.json`

interface AniListCacheEntry {
  id: number
  nativeTitle: string
  status: string
  year: number
  quarter: number
}

type AniListCache = Record<string, AniListCacheEntry | null>

function progress(msg: string) {
  process.stdout.write(`\r\x1b[K${msg}`)
}

const isEvent = (title: string) =>
  /舞台|THE STAGE|\bSTAGE\b|ステージ|\bMUSICAL\b|ミュージカル|朗読劇|\bLIVE\b|ライブ|コンサート|フェス|公演|イベント/i.test(title)

async function loadCache(): Promise<AniListCache> {
  const file = Bun.file(MAPPING_PATH)
  if (await file.exists()) return file.json()
  return {}
}

async function saveCache(cache: AniListCache): Promise<void> {
  await Bun.write(MAPPING_PATH, JSON.stringify(cache, null, 2) + '\n')
}

// --- Main ---

mkdirSync(CACHE_DIR, { recursive: true })

const inputFile = Bun.file(INPUT_PATH)
if (!(await inputFile.exists())) {
  console.error(`Input file not found: ${INPUT_PATH}`)
  console.error('Run "bun scripts/fetch/amazon/browse.ts --all" first.')
  process.exit(1)
}

const titles: Title[] = await inputFile.json()
const cache = await loadCache()

console.log(`Titles: ${titles.length}, Cached: ${Object.keys(cache).length}`)

const toProcess = titles.filter((t) => !(t.contentId in cache) && !isEvent(t.title))
const skippedCount = titles.filter((t) => isEvent(t.title)).length
const cachedCount = titles.filter((t) => t.contentId in cache).length

console.log(`To search: ${toProcess.length}, Already cached: ${cachedCount}, Skipped (event): ${skippedCount}`)

const adapter = new AniListAdapter()
let foundCount = 0
let notFoundCount = 0

for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
  const batch = toProcess.slice(i, i + BATCH_SIZE)

  try {
    const results = await adapter.identifyBatch(batch.map((t) => t.title))
    for (const [j, entry] of batch.entries()) {
      const result = results[j]
      if (result) {
        cache[entry.contentId] = {
          id: result.aniListId!,
          nativeTitle: result.title,
          status: result.status,
          year: result.year,
          quarter: result.quarter,
        }
        foundCount++
      } else {
        cache[entry.contentId] = null
        notFoundCount++
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes('429')) {
      console.log('\n  Rate limited, waiting 60s...')
      await new Promise((r) => setTimeout(r, 60_000))
      try {
        const results = await adapter.identifyBatch(batch.map((t) => t.title))
        for (const [j, entry] of batch.entries()) {
          const result = results[j]
          if (result) {
            cache[entry.contentId] = {
              id: result.aniListId!,
              nativeTitle: result.title,
              status: result.status,
              year: result.year,
              quarter: result.quarter,
            }
            foundCount++
          } else {
            cache[entry.contentId] = null
            notFoundCount++
          }
        }
      } catch {
        console.log('  Retry failed, skipping batch')
        for (const _ of batch) notFoundCount++
      }
    } else {
      console.log(`\n  Error: ${msg}`)
      for (const _ of batch) notFoundCount++
    }
  }

  const done = Math.min(i + BATCH_SIZE, toProcess.length)
  progress(`${done}/${toProcess.length} — found: ${foundCount}, not found: ${notFoundCount}`)

  if (done % (BATCH_SIZE * 5) === 0 || done >= toProcess.length) {
    await saveCache(cache)
  }
}

if (toProcess.length > 0) console.log('')
console.log(`AniList result: ${foundCount} found, ${notFoundCount} not found`)

// Build identified output
function buildIdentified(filter: (t: Title) => boolean) {
  return titles
    .filter((t) => filter(t) && !isEvent(t.title) && cache[t.contentId])
    .map((t) => {
      const c = cache[t.contentId]!
      return {
        contentId: t.contentId,
        title: t.title,
        entityType: t.entityType,
        imageUrl: t.imageUrl,
        aniListId: c.id,
        aniListTitle: c.nativeTitle,
        status: c.status,
        year: c.year,
        quarter: c.quarter,
      }
    })
}

const identifiedTv = buildIdentified((t) => t.entityType !== 'movie')
await Bun.write(OUTPUT_PATH, JSON.stringify(identifiedTv, null, 2) + '\n')
console.log(`Saved ${identifiedTv.length} identified TV titles to ${OUTPUT_PATH}`)

const identifiedMovies = buildIdentified((t) => t.entityType === 'movie')
await Bun.write(OUTPUT_MOVIES_PATH, JSON.stringify(identifiedMovies, null, 2) + '\n')
console.log(`Saved ${identifiedMovies.length} identified movies to ${OUTPUT_MOVIES_PATH}`)

// Save not-found list
const notFoundList = titles
  .filter((t) => cache[t.contentId] === null && !isEvent(t.title))
  .map((t) => ({ contentId: t.contentId, originalTitle: t.title, cleaned: cleanTitle(t.title) }))
  .sort((a, b) => a.originalTitle.localeCompare(b.originalTitle, 'ja'))

await Bun.write(NOT_FOUND_PATH, JSON.stringify(notFoundList, null, 2) + '\n')
console.log(`Not found: ${notFoundList.length} → ${NOT_FOUND_PATH}`)
