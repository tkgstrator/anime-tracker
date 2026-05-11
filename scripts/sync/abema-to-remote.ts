#!/usr/bin/env bun
/**
 * Push Abema-related rows (anime + seasons + episodes + abema_key_archives) from
 * the local miniflare D1 sqlite to the remote staging D1, replacing the existing
 * Abema slice. Other providers are untouched.
 */
import { Database } from 'bun:sqlite'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'
const REMOTE_DB = 'anime-tracker-staging'
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
  const out: string[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = chunk.map((r) => `(${cols.map((c) => quote(r[c])).join(',')})`).join(',\n')
    out.push(`INSERT INTO "${table}" (${colList}) VALUES\n${values};`)
  }
  return out
}

console.log('[1/5] Reading local Abema rows...')
const animes = db.prepare("SELECT * FROM anime WHERE provider='abema'").all() as Row[]
const animeIds = animes.map((a) => String(a.id))
console.log(`  anime: ${animes.length}`)

const placeholders = (n: number) => Array(n).fill('?').join(',')
const seasons = animeIds.length
  ? (db.prepare(`SELECT * FROM seasons WHERE anime_id IN (${placeholders(animeIds.length)})`).all(...animeIds) as Row[])
  : []
const seasonIds = seasons.map((s) => String(s.id))
console.log(`  seasons: ${seasons.length}`)

const episodes = seasonIds.length
  ? (() => {
      const acc: Row[] = []
      for (let i = 0; i < seasonIds.length; i += 500) {
        const chunk = seasonIds.slice(i, i + 500)
        acc.push(
          ...(db.prepare(`SELECT * FROM episodes WHERE season_id IN (${placeholders(chunk.length)})`).all(...chunk) as Row[])
        )
      }
      return acc
    })()
  : []
console.log(`  episodes: ${episodes.length}`)

const keys = db.prepare('SELECT * FROM abema_key_archives').all() as Row[]
console.log(`  keys: ${keys.length}`)

console.log('[2/5] Building SQL files (chunked under file-size limit)...')
mkdirSync('.cache', { recursive: true })
const ts = Math.floor(Date.now() / 1000)
const dir = `.cache/abema-to-remote-${ts}`
mkdirSync(dir, { recursive: true })

function writeChunkedFiles(prefix: string, statements: string[]): string[] {
  const files: string[] = []
  let buf = ''
  let idx = 0
  const flush = () => {
    if (!buf) return
    const file = `${dir}/${prefix}-${String(idx).padStart(3, '0')}.sql`
    writeFileSync(file, buf)
    files.push(file)
    buf = ''
    idx += 1
  }
  for (const stmt of statements) {
    if (buf && Buffer.byteLength(buf) + Buffer.byteLength(stmt) + 1 > MAX_FILE_BYTES) flush()
    buf = buf ? `${buf}\n${stmt}` : stmt
  }
  flush()
  return files
}

const allFiles: string[] = [
  ...writeChunkedFiles('00-delete', ["DELETE FROM anime WHERE provider = 'abema';"]),
  ...writeChunkedFiles('01-anime', buildInserts('anime', animes)),
  ...writeChunkedFiles('02-seasons', buildInserts('seasons', seasons)),
  ...writeChunkedFiles('03-episodes', buildInserts('episodes', episodes)),
  ...writeChunkedFiles('04-keys', buildInserts('abema_key_archives', keys))
]
console.log(`  wrote ${allFiles.length} files in ${dir}`)

console.log('[3/5] Applying to remote D1 (this may take a while)...')
const env = { ...process.env }
for (const file of allFiles) {
  console.log(`  applying ${file} (${(statSync(file).size / 1024) | 0} KB)`)
  const result = spawnSync(
    'bunx',
    ['wrangler', 'd1', 'execute', REMOTE_DB, '--remote', '--file', file, '-y'],
    { stdio: 'inherit', env }
  )
  if (result.status !== 0) {
    console.error(`wrangler d1 execute failed for ${file}: status=${result.status}`)
    process.exit(result.status ?? 1)
  }
}

console.log('[4/5] Verifying remote counts...')
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
    "SELECT (SELECT COUNT(*) FROM anime WHERE provider='abema') AS anime, (SELECT COUNT(*) FROM seasons WHERE anime_id IN (SELECT id FROM anime WHERE provider='abema')) AS seasons, (SELECT COUNT(*) FROM episodes WHERE season_id IN (SELECT id FROM seasons WHERE anime_id IN (SELECT id FROM anime WHERE provider='abema'))) AS episodes, (SELECT COUNT(*) FROM abema_key_archives) AS keys"
  ],
  { encoding: 'utf8', env }
)
console.log(verify.stdout)
console.log(verify.stderr)

console.log('[5/5] Done.')
