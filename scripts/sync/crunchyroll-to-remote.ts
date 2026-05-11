#!/usr/bin/env bun
/**
 * ローカル miniflare D1 (sqlite) の Crunchyroll データのみを remote staging D1 に部分反映する。
 *
 * 対象:
 *   - anime WHERE provider='crunchyroll'
 *   - seasons (上記 anime の子)
 *   - episodes (上記 seasons の子)
 *   - unidentified_anime WHERE provider='crunchyroll'
 *
 * 他 provider (amazon/abema/hulu/netflix) の行や anilist_media / abema_key_archives は触らない。
 *
 * 既存リモートの Crunchyroll 行は DELETE してから INSERT する (FK 子 → 親の順で DELETE)。
 *
 * Usage:
 *   bun scripts/sync/crunchyroll-to-remote.ts
 */
import { Database } from 'bun:sqlite'
import { spawnSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import dayjs from 'dayjs'

const LOCAL_DB =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'
const REMOTE_DB = 'anime-tracker-staging'
const PROVIDER = 'crunchyroll'
const CHUNK = 50
const MAX_FILE_BYTES = 4 * 1024 * 1024

const db = new Database(LOCAL_DB, { readonly: true })

type Row = Record<string, unknown>

function quote(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'bigint') return v.toString()
  if (v instanceof Uint8Array) {
    const hex = Array.from(v, (b) => b.toString(16).padStart(2, '0')).join('')
    return `X'${hex}'`
  }
  return `'${String(v).replaceAll("'", "''")}'`
}

function buildInserts(table: string, rows: Row[]): string[] {
  if (rows.length === 0) return []
  const cols = Object.keys(rows[0])
  const colList = cols.map((c) => `"${c}"`).join(',')
  const stmts: string[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = chunk.map((r) => `(${cols.map((c) => quote(r[c])).join(',')})`).join(',\n')
    stmts.push(`INSERT INTO "${table}" (${colList}) VALUES\n${values};`)
  }
  return stmts
}

function writeChunkedFiles(dir: string, prefix: string, statements: string[]): string[] {
  const files: string[] = []
  const flushed: { buf: string; idx: number } = { buf: '', idx: 0 }
  const flush = () => {
    if (!flushed.buf) return
    const file = `${dir}/${prefix}-${String(flushed.idx).padStart(3, '0')}.sql`
    writeFileSync(file, flushed.buf)
    files.push(file)
    flushed.buf = ''
    flushed.idx += 1
  }
  for (const stmt of statements) {
    if (flushed.buf && Buffer.byteLength(flushed.buf) + Buffer.byteLength(stmt) + 1 > MAX_FILE_BYTES) flush()
    flushed.buf = flushed.buf ? `${flushed.buf}\n${stmt}` : stmt
  }
  flush()
  return files
}

// --- read local rows ---
console.log(`[1/4] Reading local Crunchyroll rows...`)
const anime = db
  .prepare('SELECT * FROM anime WHERE provider = ?')
  .all(PROVIDER) as Row[]
const animeIds = anime.map((r) => r.id as string)
const animeIdList = animeIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(',')

const seasons =
  animeIds.length === 0
    ? []
    : (db
        .prepare(`SELECT * FROM seasons WHERE anime_id IN (${animeIdList})`)
        .all() as Row[])
const seasonIds = seasons.map((r) => r.id as string)
const seasonIdList = seasonIds.map((id) => `'${id.replaceAll("'", "''")}'`).join(',')

const episodes =
  seasonIds.length === 0
    ? []
    : (db
        .prepare(`SELECT * FROM episodes WHERE season_id IN (${seasonIdList})`)
        .all() as Row[])

const unidentified = db
  .prepare('SELECT * FROM unidentified_anime WHERE provider = ?')
  .all(PROVIDER) as Row[]

console.log(`  anime: ${anime.length}`)
console.log(`  seasons: ${seasons.length}`)
console.log(`  episodes: ${episodes.length}`)
console.log(`  unidentified_anime: ${unidentified.length}`)

// --- build SQL files ---
console.log('[2/4] Building SQL files (chunked under 4MB)...')
mkdirSync('.cache', { recursive: true })
const ts = dayjs().format('YYYYMMDD-HHmmss')
const dir = `.cache/crunchyroll-to-remote-${ts}`
mkdirSync(dir, { recursive: true })

// DELETE は FK 子 → 親の順
// episodes/seasons はリモート側の anime.provider='crunchyroll' を辿って削除する
// (ローカルの id と一致しなくても、リモートの Crunchyroll 系統を綺麗に消すため)
const deleteStatements = [
  `DELETE FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anime_id IN (SELECT id FROM anime WHERE provider = '${PROVIDER}'));`,
  `DELETE FROM seasons WHERE anime_id IN (SELECT id FROM anime WHERE provider = '${PROVIDER}');`,
  `DELETE FROM anime WHERE provider = '${PROVIDER}';`,
  `DELETE FROM unidentified_anime WHERE provider = '${PROVIDER}';`
]

const allFiles: string[] = [
  ...writeChunkedFiles(dir, '00-delete', deleteStatements),
  ...writeChunkedFiles(dir, '01-anime', buildInserts('anime', anime)),
  ...writeChunkedFiles(dir, '02-seasons', buildInserts('seasons', seasons)),
  ...writeChunkedFiles(dir, '03-episodes', buildInserts('episodes', episodes)),
  ...writeChunkedFiles(dir, '04-unidentified', buildInserts('unidentified_anime', unidentified))
]
console.log(`  wrote ${allFiles.length} files in ${dir}`)

// --- apply to remote ---
console.log('[3/4] Applying to remote D1 (this may take a while)...')
const start = dayjs()
for (const [i, file] of allFiles.entries()) {
  const sizeKB = Math.floor(statSync(file).size / 1024)
  console.log(`  [${i + 1}/${allFiles.length}] applying ${file.split('/').pop()} (${sizeKB} KB)`)
  const result = spawnSync(
    'bunx',
    ['wrangler', 'd1', 'execute', REMOTE_DB, '--remote', '--file', file, '-y'],
    { stdio: 'inherit', env: { ...process.env } }
  )
  if (result.status !== 0) {
    console.error(`wrangler d1 execute failed for ${file}: status=${result.status}`)
    process.exit(result.status ?? 1)
  }
}
const elapsed = dayjs().diff(start, 'second')
console.log(`  applied in ${elapsed}s`)

// --- verify ---
console.log('[4/4] Verifying remote Crunchyroll counts...')
const verify = spawnSync(
  'bunx',
  [
    'wrangler',
    'd1',
    'execute',
    REMOTE_DB,
    '--remote',
    '--json',
    '--command',
    `SELECT
       (SELECT COUNT(*) FROM anime WHERE provider = '${PROVIDER}') AS anime,
       (SELECT COUNT(*) FROM seasons WHERE anime_id IN (SELECT id FROM anime WHERE provider = '${PROVIDER}')) AS seasons,
       (SELECT COUNT(*) FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anime_id IN (SELECT id FROM anime WHERE provider = '${PROVIDER}'))) AS episodes,
       (SELECT COUNT(*) FROM unidentified_anime WHERE provider = '${PROVIDER}') AS unidentified`
  ],
  { encoding: 'utf8', env: { ...process.env } }
)
console.log(verify.stdout)
console.log('Done.')
