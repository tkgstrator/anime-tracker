/**
 * Huluでエピソード0件のアニメに対して再取得 → AniList識別 → ローカルD1に一括書き込み。
 *
 * 5件ずつHuluから並列取得し、50件溜まったらAniListでバッチ識別。
 * 全件処理後にまとめてD1に書き込む。
 *
 * Usage:
 *   bun scripts/refetch_hulu_empty.ts           # エピソード0件のみ対象
 *   bun scripts/refetch_hulu_empty.ts --force    # 既存データを上書き（全Huluタイトル対象）
 */
import { mkdirSync, rmSync } from 'node:fs'
import { v5 as uuidv5 } from 'uuid'
import { AniListAdapter } from '../src/lib/metadata/anilist'
import type { TitleMetadata } from '../src/schemas/providers/metadata.dto'
import { HuluProvider } from '../src/lib/providers/hulu'
import type { TitleInfo } from '../src/schemas/providers/common.dto'

const NAMESPACE = uuidv5('animetracker', uuidv5.DNS)
const FETCH_CONCURRENCY = 5
const ANILIST_BATCH_SIZE = 50
const DB_NAME = 'anime-tracker-staging'
const CACHE_DIR = '.cache/hulu'
const force = process.argv.includes('--force')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function esc(value: string): string {
  return value.replace(/'/g, "''")
}

function sqlVal(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'boolean') return value ? '1' : '0'
  if (typeof value === 'number') return String(value)
  return `'${esc(String(value))}'`
}

function queryD1<T>(command: string): T[] {
  const result = Bun.spawnSync({
    cmd: ['bunx', 'wrangler', 'd1', 'execute', DB_NAME, '--local', '--command', command, '--json'],
    stdout: 'pipe',
    stderr: 'pipe'
  })
  if (result.exitCode !== 0) {
    throw new Error(`D1 query failed: ${result.stderr.toString()}`)
  }
  return JSON.parse(result.stdout.toString())[0].results as T[]
}

function execD1Sql(filePath: string): void {
  const result = Bun.spawnSync({
    cmd: ['bunx', 'wrangler', 'd1', 'execute', DB_NAME, '--local', '--file', filePath],
    stdout: 'pipe',
    stderr: 'pipe'
  })
  if (result.exitCode !== 0) {
    throw new Error(`D1 exec failed: ${result.stderr.toString()}`)
  }
}

function progress(msg: string) {
  process.stdout.write(`\r\x1b[K${msg}`)
}

interface FetchedTitle {
  animeId: string
  slug: string
  titleInfo: TitleInfo
  metadata?: TitleMetadata
}

// ---------------------------------------------------------------------------
// Step 1: D1からエピソード0件のHuluアニメ取得
// ---------------------------------------------------------------------------

const query = force
  ? "SELECT a.id, a.content_id FROM anime a WHERE a.provider = 'hulu'"
  : `SELECT a.id, a.content_id FROM anime a
     WHERE a.provider = 'hulu'
     AND a.id NOT IN (
       SELECT s.anime_id FROM seasons s
       INNER JOIN episodes e ON e.season_id = s.id
     )`

const rows = queryD1<{ id: string; content_id: string }>(query)
console.log(`[Step 1] Found ${rows.length} Hulu titles (force: ${force})`)

if (rows.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

// ---------------------------------------------------------------------------
// Step 2 & 3: Hulu取得（5件並列）→ 50件ごとにAniList識別
// ---------------------------------------------------------------------------

console.log(`\n[Step 2] Fetching from Hulu (${FETCH_CONCURRENCY} concurrent) + AniList identify (per ${ANILIST_BATCH_SIZE})...`)

mkdirSync(CACHE_DIR, { recursive: true })
const cacheFile = Bun.file(`${CACHE_DIR}/anilist_mapping.json`)
const rawCache: Record<string, Record<string, unknown> | null> = (await cacheFile.exists()) ? await cacheFile.json() : {}

// 古い形式 { id, nativeTitle } → 新しい形式 { aniListId, title } に正規化
const cache: Record<string, TitleMetadata | null> = {}
for (const [key, val] of Object.entries(rawCache)) {
  if (val === null) {
    cache[key] = null
  } else if ('nativeTitle' in val) {
    cache[key] = {
      aniListId: val.id as number,
      title: val.nativeTitle as string,
      status: val.status as string,
      year: val.year as number,
      quarter: val.quarter as number
    } as TitleMetadata
  } else {
    cache[key] = val as TitleMetadata
  }
}

const anilist = new AniListAdapter()
const hulu = new HuluProvider()
const allFetched: FetchedTitle[] = []
const pendingIdentify: FetchedTitle[] = []
let fetchSuccess = 0
let fetchFailed = 0
let aniFound = 0
let aniNotFound = 0
let aniCacheHits = 0

async function identifyBatch(batch: FetchedTitle[]) {
  // キャッシュ済みを先に適用
  const toSearch: FetchedTitle[] = []
  for (const t of batch) {
    if (t.slug in cache) {
      const cached = cache[t.slug]
      if (cached) t.metadata = cached
      aniCacheHits++
    } else {
      toSearch.push(t)
    }
  }

  if (toSearch.length === 0) return

  const titles = toSearch.map((t) => t.titleInfo.title)
  const results = await anilist.identifyBatch(titles)

  for (const [idx, result] of results.entries()) {
    const slug = toSearch[idx].slug
    if (result) {
      cache[slug] = result
      toSearch[idx].metadata = result
      aniFound++
    } else {
      cache[slug] = null
      aniNotFound++
    }
  }

  // キャッシュ定期保存
  await Bun.write(`${CACHE_DIR}/anilist_mapping.json`, JSON.stringify(cache, null, 2) + '\n')
}

for (let i = 0; i < rows.length; i += FETCH_CONCURRENCY) {
  const batch = rows.slice(i, i + FETCH_CONCURRENCY)
  const results = await Promise.allSettled(
    batch.map(async (row) => {
      const titleInfo = await hulu.fetchTitleInfo(row.content_id)
      return { animeId: row.id, slug: row.content_id, titleInfo } as FetchedTitle
    })
  )

  for (const [idx, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      allFetched.push(r.value)
      pendingIdentify.push(r.value)
      fetchSuccess++
    } else {
      fetchFailed++
      console.error(`  FAILED [${batch[idx].content_id}]: ${r.reason}`)
    }
  }

  // 50件溜まったらAniList識別
  if (pendingIdentify.length >= ANILIST_BATCH_SIZE) {
    await identifyBatch(pendingIdentify.splice(0, ANILIST_BATCH_SIZE))
  }

  const done = fetchSuccess + fetchFailed
  progress(`  [${done}/${rows.length}] fetch: ${fetchSuccess} ok / ${fetchFailed} failed | anilist: ${aniFound} found / ${aniNotFound} not found / ${aniCacheHits} cached`)
}

// 残りをAniList識別
if (pendingIdentify.length > 0) {
  await identifyBatch(pendingIdentify)
}

console.log('')
console.log(`  Fetch: ${fetchSuccess} succeeded, ${fetchFailed} failed`)
console.log(`  AniList: ${aniFound} found, ${aniNotFound} not found, ${aniCacheHits} cached`)

// キャッシュ最終保存
await Bun.write(`${CACHE_DIR}/anilist_mapping.json`, JSON.stringify(cache, null, 2) + '\n')

// ---------------------------------------------------------------------------
// Step 4: SQL生成 → D1一括書き込み
// ---------------------------------------------------------------------------

console.log(`\n[Step 3] Writing to local D1...`)

const now = new Date().toISOString()
const statements: string[] = []
let animeUpdated = 0
let seasonCount = 0
let episodeCount = 0

for (const { animeId, slug, titleInfo, metadata } of allFetched) {
  // anime行のメタデータ更新
  if (metadata) {
    const title = metadata.title || titleInfo.title
    statements.push(
      `UPDATE anime SET title = ${sqlVal(title)}, status = ${sqlVal(metadata.status)}, year = ${sqlVal(metadata.year)}, quarter = ${sqlVal(metadata.quarter)}, anilist_id = ${sqlVal(metadata.aniListId)}, is_identified = 1, updated_at = ${sqlVal(now)} WHERE id = ${sqlVal(animeId)}`
    )
    animeUpdated++
  }

  // 既存seasons/episodes削除
  statements.push(`DELETE FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anime_id = ${sqlVal(animeId)})`)
  statements.push(`DELETE FROM seasons WHERE anime_id = ${sqlVal(animeId)}`)

  for (const season of titleInfo.seasons) {
    const seasonUuid = uuidv5(`hulu:${slug}:${season.seasonId}`, NAMESPACE)

    statements.push(
      `INSERT INTO seasons (id, anime_id, season_id, display_name, season_number, image_url, created_at) VALUES (${sqlVal(seasonUuid)}, ${sqlVal(animeId)}, ${sqlVal(season.seasonId)}, ${sqlVal(season.displayName)}, ${sqlVal(season.seasonNumber)}, ${sqlVal(season.imageUrl ?? '')}, ${sqlVal(now)})`
    )
    seasonCount++

    const seenEpNumbers = new Set<number>()
    for (const ep of season.episodes) {
      if (seenEpNumbers.has(ep.episodeNumber)) continue
      seenEpNumbers.add(ep.episodeNumber)
      const epUuid = uuidv5(`hulu:${slug}:${season.seasonId}:${ep.episodeNumber}`, NAMESPACE)

      statements.push(
        `INSERT INTO episodes (id, season_id, episode_number, episode_id, title, description, release_date, duration, maturity_rating, image_url, has_subtitles, has_dub, benefit_id, recorded, created_at) VALUES (${sqlVal(epUuid)}, ${sqlVal(seasonUuid)}, ${sqlVal(ep.episodeNumber)}, ${sqlVal(ep.episodeId)}, ${sqlVal(ep.title ?? '')}, ${sqlVal(ep.description ?? '')}, ${sqlVal(ep.releaseDate ?? '')}, ${sqlVal(ep.duration ?? 0)}, ${sqlVal(ep.maturityRating)}, ${sqlVal(ep.imageUrl ?? '')}, ${sqlVal(ep.hasSubtitles ?? false)}, ${sqlVal(ep.hasDub ?? false)}, ${sqlVal(ep.benefitId)}, 0, ${sqlVal(now)})`
      )
      episodeCount++
    }
  }
}

// SQLファイルに書き出して一括実行
const sqlDir = `${CACHE_DIR}/refetch_sql`
rmSync(sqlDir, { recursive: true, force: true })
mkdirSync(sqlDir, { recursive: true })

const LINES_PER_FILE = 5000
const fileCount = Math.ceil(statements.length / LINES_PER_FILE)
for (let i = 0; i < fileCount; i++) {
  const chunk = statements.slice(i * LINES_PER_FILE, (i + 1) * LINES_PER_FILE)
  const filePath = `${sqlDir}/${String(i).padStart(4, '0')}.sql`
  await Bun.write(filePath, chunk.join(';\n') + ';\n')
  execD1Sql(filePath)
  progress(`  Executing SQL file ${i + 1}/${fileCount}...`)
}

console.log('')
console.log(`\nDone!`)
console.log(`  Anime updated (AniList): ${animeUpdated}`)
console.log(`  Seasons inserted: ${seasonCount}`)
console.log(`  Episodes inserted: ${episodeCount}`)
console.log(`  Fetch failed: ${fetchFailed}`)
