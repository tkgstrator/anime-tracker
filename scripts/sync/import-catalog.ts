#!/usr/bin/env bun
/**
 * Lambda の /title_list?category=catalog を 3 プロバイダで走らせ、新規タイトルを
 * D1 の anilist_media テーブルとローカル matching して書き込む。
 *
 * AniList の search backend が壊れているため、事前に
 *   bun scripts/sync/sync-anilist.ts
 * で anilist_media テーブルを埋めておくこと。
 *
 *  - 識別成功 → anime テーブルに INSERT
 *  - 識別失敗 → unidentified_anime テーブルに INSERT
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
import { cleanTitle } from '../../src/lib/metadata/anilist'
import { normalizeTitle } from '../../src/lib/metadata/normalize'
import type { Title } from '../../src/schemas/providers/common.dto'

const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const ALL_PROVIDERS = ['abema', 'hulu', 'amazon'] as const
type Provider = (typeof ALL_PROVIDERS)[number]

/** D1 の bound parameter 上限 (将来 D1 経由で動かす時のために 100 に揃える) */
const D1_VARIABLE_LIMIT = 100

function chunkArray<T>(arr: T[], size: number): T[][] {
  return arr.reduce<T[][]>((acc, _, i) => (i % size === 0 ? [...acc, arr.slice(i, i + size)] : acc), [])
}

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const targets: Provider[] = args.length === 0
  ? [...ALL_PROVIDERS]
  : args.filter((a): a is Provider => (ALL_PROVIDERS as readonly string[]).includes(a))

if (targets.length === 0) {
  console.error(`Unknown provider. Valid: ${ALL_PROVIDERS.join(', ')}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------

const SEASON_TO_QUARTER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
const MONTH_TO_QUARTER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] as const

interface AnilistRow {
  id: number
  title_native: string | null
  season: string | null
  season_year: number | null
  status: string
  start_year: number | null
  start_month: number | null
}

interface Match {
  aniListId: number
  title: string
  status: string
  year: number
  quarter: number
}

function toMatch(row: AnilistRow): Match | undefined {
  const year = row.season_year ?? row.start_year
  const quarter = row.season
    ? SEASON_TO_QUARTER[row.season]
    : row.start_month != null
      ? MONTH_TO_QUARTER[row.start_month - 1]
      : null
  if (year == null || quarter == null) return undefined
  return {
    aniListId: row.id,
    title: row.title_native ?? '',
    status: row.status,
    year,
    quarter
  }
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
  const animeRows = db
    .prepare<{ content_id: string }, [string]>('SELECT content_id FROM anime WHERE provider = ?')
    .all(provider)
  const unidRows = db
    .prepare<{ content_id: string }, [string]>('SELECT content_id FROM unidentified_anime WHERE provider = ?')
    .all(provider)
  return new Set([...animeRows.map((r) => r.content_id), ...unidRows.map((r) => r.content_id)])
}

/**
 * 全 provider title の normalized 形を一括収集し、100 件 chunk で anilist_media を
 * batched lookup して norm → row のマップを返す。
 *
 * D1 経由で動かす場合 IN (?, ..., ?) は ~100 placeholder までという制約があるので
 * chunk して順次実行する。bun:sqlite では制限なしだが将来移植のために揃える。
 */
function buildAnilistLookup(db: Database, titles: Title[]): Map<string, AnilistRow> {
  const norms = new Set<string>()
  for (const t of titles) {
    const raw = normalizeTitle(t.title)
    if (raw) norms.add(raw)
    const cleaned = normalizeTitle(cleanTitle(t.title))
    if (cleaned) norms.add(cleaned)
  }

  const map = new Map<string, AnilistRow>()
  // chunk あたり 100 placeholder = 3 列 × ~33 値 にすると煩雑なので、列ごとに pass を分ける
  for (const column of ['native_norm', 'romaji_norm', 'english_norm']) {
    for (const chunk of chunkArray([...norms], D1_VARIABLE_LIMIT)) {
      const placeholders = chunk.map(() => '?').join(',')
      const rows = db
        .prepare<AnilistRow & { norm_value: string }, string[]>(
          `SELECT id, title_native, season, season_year, status, start_year, start_month,
                  ${column} AS norm_value
           FROM anilist_media
           WHERE ${column} IN (${placeholders})
           ORDER BY season_year DESC, id DESC`
        )
        .all(...chunk)
      for (const r of rows) {
        // ORDER BY DESC で最新が先なので、既に登録済みなら上書きしない
        if (!map.has(r.norm_value)) {
          const { norm_value: _drop, ...rest } = r
          map.set(r.norm_value, rest)
        }
      }
    }
  }
  return map
}

function findInLookup(lookup: Map<string, AnilistRow>, t: Title): Match | undefined {
  const rawNorm = normalizeTitle(t.title)
  if (rawNorm) {
    const hit = lookup.get(rawNorm)
    if (hit) return toMatch(hit)
  }
  const cleanedNorm = normalizeTitle(cleanTitle(t.title))
  if (cleanedNorm && cleanedNorm !== rawNorm) {
    const hit = lookup.get(cleanedNorm)
    if (hit) return toMatch(hit)
  }
  return undefined
}

interface InsertCounts {
  identified: number
  unidentified: number
}

function importProvider(provider: Provider, entries: Title[], db: Database): InsertCounts {
  const existing = loadExistingContentIds(db, provider)
  console.log(`[${provider}] existing rows: ${existing.size} (anime + unidentified)`)

  const newEntries = entries.filter((t) => !existing.has(t.contentId))
  console.log(`[${provider}] new entries to import: ${newEntries.length}`)

  if (newEntries.length === 0) {
    return { identified: 0, unidentified: 0 }
  }

  const insertAnime = db.prepare(
    `INSERT OR IGNORE INTO anime (
       id, title, description, provider, content_id, entity_type,
       maturity_rating, image_url, year, quarter, status,
       anilist_id, badge, next_episode_date, expired_at, expiring_season,
       scheduled, recorded, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?)`
  )
  const insertUnid = db.prepare(
    `INSERT OR IGNORE INTO unidentified_anime (
       id, provider, content_id, title, created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?)`
  )

  const counts: InsertCounts = { identified: 0, unidentified: 0 }
  const ts = dayjs().toISOString()

  // 全 newEntries の normalized title を一括 lookup
  const lookup = buildAnilistLookup(db, newEntries)
  console.log(`[${provider}] lookup map size: ${lookup.size}`)

  const tx = db.transaction(() => {
    for (const t of newEntries) {
      const meta = findInLookup(lookup, t)
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
          meta.aniListId,
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
    }
  })
  tx()

  console.log(`[${provider}] identified=${counts.identified} unidentified=${counts.unidentified}`)
  return counts
}

// ---------------------------------------------------------------------------

const db = new Database(LOCAL_DB)

// anilist_media が空だと意味ないので警告
const totalRow = db
  .prepare<{ c: number }, []>('SELECT COUNT(*) AS c FROM anilist_media')
  .get()
const anilistCount = totalRow?.c ?? 0
if (anilistCount === 0) {
  console.error('anilist_media is empty. Run `bun scripts/sync/sync-anilist.ts` first.')
  process.exit(1)
}
console.log(`anilist_media size: ${anilistCount}`)
console.log(`Targets: ${targets.join(', ')}`)
console.log(`Local D1: ${LOCAL_DB}`)
console.log()

const totals: Record<string, InsertCounts> = {}
for (const provider of targets) {
  try {
    const entries = await fetchCatalog(provider)
    totals[provider] = importProvider(provider, entries, db)
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
