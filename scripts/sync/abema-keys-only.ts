#!/usr/bin/env bun
/** Re-push only abema_key_archives to remote staging with very small chunks
 * (segmentUrls JSON pushes single INSERTs over D1's 1MB statement limit). */
import { Database } from 'bun:sqlite'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'

const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'
const REMOTE_DB = 'anime-tracker-staging'
const CHUNK = 1
const MAX_FILE_BYTES = 800 * 1024
// D1 rejects single statements ≳ 100KB (SQLITE_TOOBIG). For oversized rows we
// drop segment_urls down to "[]" — the key+iv+variantUrl are intact, segments
// can be re-fetched from the variant playlist if needed.
const MAX_STMT_BYTES = 80 * 1024

const db = new Database(LOCAL_DB, { readonly: true })

type Row = Record<string, unknown>

function quote(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'bigint') return v.toString()
  return `'${String(v).replaceAll("'", "''")}'`
}

const keys = db.prepare('SELECT * FROM abema_key_archives').all() as Row[]
console.log(`keys: ${keys.length}`)

const cols = Object.keys(keys[0])
const colList = cols.map((c) => `"${c}"`).join(',')

let truncated = 0
const stmts: string[] = []
for (let i = 0; i < keys.length; i += CHUNK) {
  const chunk = keys.slice(i, i + CHUNK)
  const values = chunk.map((r) => `(${cols.map((c) => quote(r[c])).join(',')})`).join(',\n')
  let stmt = `INSERT INTO "abema_key_archives" (${colList}) VALUES\n${values};`
  if (Buffer.byteLength(stmt) > MAX_STMT_BYTES) {
    truncated += chunk.length
    const slim = chunk.map((r) => ({ ...r, segment_urls: '[]' }))
    const slimValues = slim.map((r) => `(${cols.map((c) => quote(r[c])).join(',')})`).join(',\n')
    stmt = `INSERT INTO "abema_key_archives" (${colList}) VALUES\n${slimValues};`
  }
  stmts.push(stmt)
}
console.log(`statements: ${stmts.length} (segment_urls truncated to [] for ${truncated} oversized rows)`)

mkdirSync('.cache', { recursive: true })
const ts = Math.floor(Date.now() / 1000)
const dir = `.cache/abema-keys-only-${ts}`
mkdirSync(dir, { recursive: true })

const files: string[] = []
let buf = ''
let idx = 0
const flush = () => {
  if (!buf) return
  const file = `${dir}/keys-${String(idx).padStart(4, '0')}.sql`
  writeFileSync(file, buf)
  files.push(file)
  buf = ''
  idx += 1
}
for (const stmt of stmts) {
  if (buf && Buffer.byteLength(buf) + Buffer.byteLength(stmt) + 1 > MAX_FILE_BYTES) flush()
  buf = buf ? `${buf}\n${stmt}` : stmt
}
flush()
console.log(`wrote ${files.length} files`)

const env = { ...process.env }
for (const file of files) {
  console.log(`applying ${file} (${(statSync(file).size / 1024) | 0} KB)`)
  const result = spawnSync(
    'bunx',
    ['wrangler', 'd1', 'execute', REMOTE_DB, '--remote', '--file', file, '-y'],
    { stdio: 'inherit', env }
  )
  if (result.status !== 0) {
    console.error(`failed for ${file}: status=${result.status}`)
    process.exit(result.status ?? 1)
  }
}

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
    'SELECT COUNT(*) AS keys FROM abema_key_archives'
  ],
  { encoding: 'utf8', env }
)
console.log(verify.stdout)
console.log('Done.')
