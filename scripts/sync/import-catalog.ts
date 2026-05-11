#!/usr/bin/env bun
/**
 * Lambda の /title_list?category=catalog を 3 プロバイダで走らせ、新規タイトルを
 * AniList で 20 件ずつバッチ識別して local D1 に書き込む。
 *
 *  - 識別成功 → anime テーブルに INSERT (provider+content_id 既存はスキップ)
 *  - 識別失敗 → unidentified_anime テーブルに INSERT
 *
 * AniList は 90 req/min なので、バッチ間 800ms のスリープを挟む (~75 req/min)。
 *
 * Usage:
 *   bun scripts/sync/import-catalog.ts                # 全プロバイダ
 *   bun scripts/sync/import-catalog.ts amazon         # 指定プロバイダのみ
 *   bun scripts/sync/import-catalog.ts amazon hulu    # 複数指定
 */
import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import dayjs from 'dayjs'
import { handler } from '../../lambda/fetch/index'
import { AniListAdapter, cleanTitle } from '../../src/lib/metadata/anilist'
import type { Title } from '../../src/schemas/providers/common.dto'

const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const ALL_PROVIDERS = ['abema', 'hulu', 'amazon'] as const
type Provider = (typeof ALL_PROVIDERS)[number]

const BATCH_SIZE = 20
const BATCH_DELAY_MS = 800

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const targets: Provider[] = args.length === 0
  ? [...ALL_PROVIDERS]
  : args.filter((a): a is Provider => (ALL_PROVIDERS as readonly string[]).includes(a))

if (targets.length === 0) {
  console.error(`Unknown provider. Valid: ${ALL_PROVIDERS.join(', ')}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------

async function fetchCatalog(provider: Provider): Promise<Title[]> {
  console.log(`[${provider}] fetching catalog from lambda local...`)
  const start = dayjs()
  const event = { rawPath: '/title_list', body: JSON.stringify({ provider, category: 'catalog' }) }
  const res = await handler(event)
  if (res.statusCode !== 200) {
    throw new Error(`[${provider}] lambda failed: ${res.statusCode} ${res.body}`)
  }
  const body = JSON.parse(res.body) as { entries: Title[] }
  const ms = dayjs().diff(start, 'millisecond')
  console.log(`[${provider}] fetched ${body.entries.length} entries in ${(ms / 1000).toFixed(1)}s`)
  return body.entries
}

function loadExistingContentIds(db: Database, provider: Provider): Set<string> {
  const animeRows = db.prepare<{ content_id: string }, [string]>(
    'SELECT content_id FROM anime WHERE provider = ?'
  ).all(provider)
  const unidRows = db.prepare<{ content_id: string }, [string]>(
    'SELECT content_id FROM unidentified_anime WHERE provider = ?'
  ).all(provider)
  return new Set([...animeRows.map((r) => r.content_id), ...unidRows.map((r) => r.content_id)])
}

function chunks<T>(arr: T[], size: number): T[][] {
  return arr.reduce<T[][]>((acc, _, i) => (i % size === 0 ? [...acc, arr.slice(i, i + size)] : acc), [])
}

function nowIso(): string {
  return dayjs().toISOString()
}

interface InsertCounts {
  identified: number
  unidentified: number
}

async function importProvider(provider: Provider, db: Database, adapter: AniListAdapter): Promise<InsertCounts> {
  const entries = await fetchCatalog(provider)
  const existing = loadExistingContentIds(db, provider)
  console.log(`[${provider}] existing rows: ${existing.size} (anime + unidentified)`)

  const newEntries = entries.filter((t) => !existing.has(t.contentId))
  console.log(`[${provider}] new entries to import: ${newEntries.length}`)

  if (newEntries.length === 0) {
    return { identified: 0, unidentified: 0 }
  }

  // Anime テーブルへの INSERT を準備
  const insertAnime = db.prepare(
    `INSERT OR IGNORE INTO anime (
       id, title, description, provider, content_id, entity_type,
       maturity_rating, image_url, year, quarter, status,
       anilist_id, badge, next_episode_date, expired_at, expiring_season,
       scheduled, recorded, created_at, updated_at
     ) VALUES (
       ?, ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       ?, ?, ?, ?, ?,
       0, 0, ?, ?
     )`
  )
  const insertUnid = db.prepare(
    `INSERT OR IGNORE INTO unidentified_anime (
       id, provider, content_id, title, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)`
  )

  const batches = chunks(newEntries, BATCH_SIZE)
  const counts: InsertCounts = { identified: 0, unidentified: 0 }

  for (const [idx, batch] of batches.entries()) {
    const searches = batch.map((t) => cleanTitle(t.title))
    const results = await adapter.identifyBatch(batch.map((t) => t.title))

    const tx = db.transaction(() => {
      batch.forEach((t, i) => {
        const meta = results[i]
        const ts = nowIso()
        if (meta) {
          insertAnime.run(
            randomUUID(),
            meta.title,
            t.description ?? '',
            provider,
            t.contentId,
            t.entityType ?? 'tv',
            t.maturityRating,
            t.imageUrl ?? '',
            meta.year,
            meta.quarter,
            meta.status,
            meta.aniListId ?? 0,
            t.badge ?? null,
            null,
            null,
            null,
            ts,
            ts
          )
          counts.identified += 1
        } else {
          insertUnid.run(randomUUID(), provider, t.contentId, t.title, ts, ts)
          counts.unidentified += 1
        }
      })
    })
    tx()

    const progress = `${idx + 1}/${batches.length}`
    const sample = searches.slice(0, 2).join(' | ')
    console.log(`[${provider}] batch ${progress}  identified=${counts.identified} unidentified=${counts.unidentified}  e.g. ${sample}`)

    if (idx < batches.length - 1) {
      await new Promise((r) => setTimeout(r, BATCH_DELAY_MS))
    }
  }

  return counts
}

// ---------------------------------------------------------------------------

const db = new Database(LOCAL_DB)
const adapter = new AniListAdapter()

console.log(`Targets: ${targets.join(', ')}`)
console.log(`Local D1: ${LOCAL_DB}`)
console.log()

const totals: Record<string, InsertCounts> = {}
for (const provider of targets) {
  try {
    totals[provider] = await importProvider(provider, db, adapter)
  } catch (e) {
    console.error(`[${provider}] failed:`, e instanceof Error ? e.message : e)
    totals[provider] = { identified: 0, unidentified: 0 }
  }
  console.log()
}

db.close()

console.log('=== Summary ===')
for (const [provider, c] of Object.entries(totals)) {
  console.log(`${provider}: identified=${c.identified}  unidentified=${c.unidentified}`)
}
