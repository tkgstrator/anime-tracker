#!/usr/bin/env bun
/**
 * Push Abema-related rows (anime + seasons + episodes + abema_key_archives) from
 * the local miniflare D1 sqlite to the remote staging D1, replacing the existing
 * Abema slice. Other providers are untouched.
 */
import { Database } from 'bun:sqlite'
import { mkdirSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'
const REMOTE_DB = 'anime-tracker-staging'
const CHUNK = 200

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

console.log('[2/5] Building SQL...')
const stmts: string[] = []
stmts.push('PRAGMA defer_foreign_keys = ON;')
stmts.push("DELETE FROM anime WHERE provider = 'abema';")
stmts.push(...buildInserts('anime', animes))
stmts.push(...buildInserts('seasons', seasons))
stmts.push(...buildInserts('episodes', episodes))
stmts.push(...buildInserts('abema_key_archives', keys))

mkdirSync('.cache', { recursive: true })
const ts = Math.floor(Date.now() / 1000)
const outFile = `.cache/abema-to-remote-${ts}.sql`
writeFileSync(outFile, stmts.join('\n'))
const sizeMb = (Buffer.byteLength(stmts.join('\n')) / 1024 / 1024).toFixed(1)
console.log(`  wrote ${outFile} (${sizeMb} MB, ${stmts.length} statements)`)

console.log('[3/5] Applying to remote D1 (this may take a while)...')
const env = { ...process.env }
const result = spawnSync(
  'bunx',
  ['wrangler', 'd1', 'execute', REMOTE_DB, '--remote', '--file', outFile, '-y'],
  { stdio: 'inherit', env }
)
if (result.status !== 0) {
  console.error(`wrangler d1 execute failed: status=${result.status}`)
  process.exit(result.status ?? 1)
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
