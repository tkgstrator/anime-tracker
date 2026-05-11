#!/usr/bin/env bun
/**
 * .cache/abema-keys-only-<ts>/ の SQL chunk を現在のローカル D1 に流し込む。
 * cache 内の episode_id は古い random UUID なので、program_id をキーに
 * 現在の episodes.id へリマップしてから INSERT する。
 *
 * Usage:
 *   bun scripts/sync/restore-abema-keys.ts [cache-dir]
 *   (default: .cache/abema-keys-only-1778422729)
 */
import { Database } from 'bun:sqlite'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const LOCAL_DB =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const DEFAULT_CACHE_DIR = '.cache/abema-keys-only-1778422729'
const cacheDir = process.argv[2] ?? DEFAULT_CACHE_DIR

interface ArchiveRow {
  id: string
  episode_id: string
  program_id: string
  cid: string
  content_key_hex: string
  iv_hex: string
  variant_url: string
  variant_resolution: string
  variant_bandwidth: number
  segment_urls: string
  created_at: string
}

interface EpisodeRow {
  program_id: string
  uuid: string
}

// --- step 1: chunk を全部 :memory: DB に流し込む ---
console.log(`loading chunks from ${cacheDir}...`)
const tmp = new Database(':memory:')
tmp.run(`CREATE TABLE abema_key_archives (
  id TEXT PRIMARY KEY,
  episode_id TEXT,
  program_id TEXT,
  cid TEXT,
  content_key_hex TEXT,
  iv_hex TEXT,
  variant_url TEXT,
  variant_resolution TEXT,
  variant_bandwidth INTEGER,
  segment_urls TEXT,
  created_at TEXT
)`)

const chunkFiles = readdirSync(cacheDir)
  .filter((f) => f.endsWith('.sql'))
  .sort()
console.log(`found ${chunkFiles.length} chunks`)

for (const f of chunkFiles) {
  const sql = readFileSync(resolve(cacheDir, f), 'utf8')
  // chunk は INSERT 文しか含まないので exec で連続実行
  tmp.exec(sql)
}

const sourceCount = (tmp.prepare('SELECT COUNT(*) AS n FROM abema_key_archives').get() as { n: number }).n
console.log(`loaded ${sourceCount} cached key rows`)

// --- step 2: 現在の episodes から program_id → uuid のマップを作る ---
console.log(`opening local D1 at ${LOCAL_DB}...`)
const target = new Database(LOCAL_DB)
const mapping = new Map<string, string>()
for (const r of target.prepare<EpisodeRow, []>('SELECT episode_id AS program_id, id AS uuid FROM episodes').all()) {
  mapping.set(r.program_id, r.uuid)
}
console.log(`current episodes count: ${mapping.size}`)

// --- step 3: ソースをイテレートして remap + INSERT ---
const insert = target.prepare(`INSERT OR IGNORE INTO abema_key_archives (
  id, episode_id, program_id, cid, content_key_hex, iv_hex,
  variant_url, variant_resolution, variant_bandwidth, segment_urls, created_at
) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)

const counters = { inserted: 0, unmatched: 0, duplicate: 0 }
const tx = target.transaction(() => {
  for (const row of tmp.prepare<ArchiveRow, []>('SELECT * FROM abema_key_archives').all()) {
    const newEpId = mapping.get(row.program_id)
    if (!newEpId) {
      counters.unmatched += 1
      continue
    }
    const result = insert.run(
      row.id,
      newEpId,
      row.program_id,
      row.cid,
      row.content_key_hex,
      row.iv_hex,
      row.variant_url,
      row.variant_resolution,
      row.variant_bandwidth,
      row.segment_urls,
      row.created_at
    )
    if (result.changes === 0) counters.duplicate += 1
    else counters.inserted += 1
  }
})
tx()

console.log('\n=== summary ===')
console.log(`  inserted:  ${counters.inserted}`)
console.log(`  duplicate: ${counters.duplicate}`)
console.log(`  unmatched: ${counters.unmatched} (program_id が現在の episodes に存在せず)`)

target.close()
tmp.close()
