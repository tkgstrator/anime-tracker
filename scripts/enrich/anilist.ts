import { searchAniListBatch, type AniListResult } from '../../src/lib/anilist'

const CACHE_DIR = '.cache'

type Mapping = Record<string, AniListResult | null>

interface Episode {
  episodeNumber: number
  episodeId: string
  title: string
  description: string
  [key: string]: unknown
}

interface Season {
  seasonNumber: number
  episodes: Episode[]
  [key: string]: unknown
}

interface Title {
  contentId: string
  title: string
  description: string
  entityType?: string
  seasons: Season[]
  status?: string
  year?: number | null
  quarter?: number | null
  [key: string]: unknown
}

async function loadMapping(provider: string): Promise<Mapping> {
  const file = Bun.file(`${CACHE_DIR}/${provider}/anilist_mapping.json`)
  if (await file.exists()) return file.json()
  return {}
}

async function saveMapping(provider: string, mapping: Mapping): Promise<void> {
  await Bun.write(`${CACHE_DIR}/${provider}/anilist_mapping.json`, JSON.stringify(mapping, null, 2) + '\n')
}

function progress(msg: string) {
  process.stdout.write(`\r\x1b[K${msg}`)
}

const shouldSkip = (t: Title) =>
  /舞台|THE STAGE|STAGE|ステージ|MUSICAL|ミュージカル|朗読劇|LIVE|ライブ|コンサート|フェス|公演|イベント/i.test(t.title)

async function processFile(provider: string, inputPath: string, outputPath: string) {
  const titles: Title[] = await Bun.file(inputPath).json()
  const mapping = await loadMapping(provider)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Processing: ${inputPath} (${titles.length} titles)`)
  console.log(`Cache: ${Object.keys(mapping).length} mappings`)
  console.log('='.repeat(60))

  // Step 1: AniList でメタデータ取得
  const toProcess = titles.filter((t) => !(t.contentId in mapping) && !shouldSkip(t))
  const cached = titles.filter((t) => t.contentId in mapping && !shouldSkip(t))
  console.log(`\n[Step 1] AniList lookup: ${toProcess.length} to search, ${cached.length} cached`)

  // バッチ検索
  const BATCH_SIZE = 50
  let found = 0
  let notFound = 0

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const chunk = toProcess.slice(i, i + BATCH_SIZE)
    const results = await searchAniListBatch(chunk.map((t) => t.title))

    for (let j = 0; j < chunk.length; j++) {
      mapping[chunk[j].contentId] = results[j]
      if (results[j]) found++
      else notFound++
    }

    const done = Math.min(i + BATCH_SIZE, toProcess.length)
    progress(`[anilist] ${done}/${toProcess.length} — found: ${found}, not found: ${notFound}`)
  }
  if (toProcess.length > 0) console.log('')
  console.log(`  Result: ${found} found, ${notFound} not found, ${cached.length} cached`)
  await saveMapping(provider, mapping)

  // Step 2: メタデータをタイトルに適用
  console.log('\n[Step 2] Apply metadata')
  let applied = 0
  let skipped = 0

  for (const title of titles) {
    if (shouldSkip(title)) {
      skipped++
      continue
    }

    const result = mapping[title.contentId]
    if (!result) {
      skipped++
      continue
    }

    title.anilistId = result.id
    if (result.nativeTitle) title.title = result.nativeTitle
    title.status = result.status ?? 'UNKNOWN'
    title.year = result.year
    title.quarter = result.quarter
    applied++
  }
  console.log(`  Applied: ${applied}, Skipped: ${skipped}`)

  // Step 3: フィルタ & contentId重複チェック
  const withMeta = titles.filter((t) => (t.anilistId || t.tmdbId) && !shouldSkip(t))
  const byContentId = new Map<string, Title>()
  let dedupCount = 0
  for (const title of withMeta) {
    const existing = byContentId.get(title.contentId)
    if (existing) {
      dedupCount++
      if (title.seasons.length > existing.seasons.length) {
        byContentId.set(title.contentId, title)
      }
    } else {
      byContentId.set(title.contentId, title)
    }
  }
  const output = [...byContentId.values()]

  // not_found.json
  const notFoundList = titles
    .filter((t) => !mapping[t.contentId] && !shouldSkip(t))
    .map((t) => ({ contentId: t.contentId, title: t.title }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ja'))
  await Bun.write(`${CACHE_DIR}/${provider}/anilist_not_found.json`, JSON.stringify(notFoundList, null, 2) + '\n')

  await Bun.write(outputPath, JSON.stringify(output, null, 2) + '\n')

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Output: ${outputPath}`)
  console.log(`  Total: ${output.length} (excluded ${titles.length - output.length})`)
  if (dedupCount > 0) console.log(`  Deduped by contentId: ${dedupCount}`)
  console.log(`  Not found: ${notFoundList.length} → ${CACHE_DIR}/${provider}/anilist_not_found.json`)
}

import { mkdirSync } from 'node:fs'
for (const dir of ['amazon', 'hulu', 'crunchyroll']) {
  mkdirSync(`${CACHE_DIR}/${dir}`, { recursive: true })
}

const providers = ['amazon', 'hulu', 'crunchyroll'] as const
for (const provider of providers) {
  await processFile(
    provider,
    `__tests__/fixtures/${provider}/episodes.json`,
    `__tests__/fixtures/${provider}/episodes_identified.json`,
  )
}
