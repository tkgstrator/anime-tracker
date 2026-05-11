#!/usr/bin/env bun
/**
 * ローカル miniflare D1 の anilist_media テーブルをまるごと remote staging D1 に upsert する。
 *
 * all-to-remote.ts は全テーブル DELETE + INSERT で重いため、anilist_media だけ
 * 同期したい時に使う (1960-1999 や orphan backfill 後の差分反映想定)。
 *
 * Usage:
 *   bun scripts/sync/anilist-media-to-remote.ts
 */
import { Database } from 'bun:sqlite'
import { spawnSync } from 'node:child_process'
import { mkdirSync, statSync, writeFileSync } from 'node:fs'
import dayjs from 'dayjs'

const LOCAL_DB =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'
const REMOTE_DB = 'anime-tracker-staging'
const CHUNK = 50
const MAX_FILE_BYTES = 4 * 1024 * 1024

type Row = Record<string, unknown>

function quote(v: unknown): string {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'bigint') return v.toString()
  return `'${String(v).replaceAll("'", "''")}'`
}

function buildUpserts(rows: Row[]): string[] {
  if (rows.length === 0) return []
  const cols = Object.keys(rows[0])
  const colList = cols.map((c) => `"${c}"`).join(',')
  const updateList = cols
    .filter((c) => c !== 'id')
    .map((c) => `"${c}"=excluded."${c}"`)
    .join(',')
  const stmts: string[] = []
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const values = chunk.map((r) => `(${cols.map((c) => quote(r[c])).join(',')})`).join(',\n')
    stmts.push(
      `INSERT INTO "anilist_media" (${colList}) VALUES\n${values}\nON CONFLICT(id) DO UPDATE SET ${updateList};`
    )
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

console.log('[1/3] Reading local anilist_media...')
const db = new Database(LOCAL_DB, { readonly: true })
const rows = db.prepare('SELECT * FROM anilist_media').all() as Row[]
console.log(`  rows: ${rows.length}`)

console.log('[2/3] Building SQL files...')
mkdirSync('.cache', { recursive: true })
const ts = dayjs().format('YYYYMMDD-HHmmss')
const dir = `.cache/anilist-media-to-remote-${ts}`
mkdirSync(dir, { recursive: true })
const files = writeChunkedFiles(dir, 'upsert', buildUpserts(rows))
console.log(`  ${files.length} files in ${dir}`)

console.log('[3/3] Applying to remote D1...')
const start = dayjs()
for (const [i, file] of files.entries()) {
  const sizeKB = Math.floor(statSync(file).size / 1024)
  console.log(`  [${i + 1}/${files.length}] ${file.split('/').pop()} (${sizeKB} KB)`)
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
console.log(`Applied in ${elapsed}s`)
