#!/usr/bin/env bun
/**
 * anime.anilist_id が anilist_media に存在しない orphan を、AniList Media(id) で
 * 個別に取得して anilist_media に upsert する。
 *
 * 通常の sync は seasonYear filter で年単位に dump しているが、seasonYear が null の
 * media は拾えないため、orphan が残る。このスクリプトは id 直接指定で穴埋めする。
 *
 * Usage:
 *   bun scripts/sync/sync-anilist-orphans.ts
 */
import { Database } from 'bun:sqlite'
import dayjs from 'dayjs'
import { normalizeTitle } from '../../src/lib/metadata/normalize'

const ANILIST_API = 'https://graphql.anilist.co'
/** AniList は現状 30 req/min に degrade。安全側で 1500ms */
const REQUEST_INTERVAL_MS = 1500
const LOCAL_DB =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const QUERY = `query ($id: Int) {
  Media(id: $id, type: ANIME) {
    id
    title { native romaji english }
    season
    seasonYear
    status
    startDate { year month }
    countryOfOrigin
  }
}`

interface AniListMedia {
  id: number
  title: { native: string | null; romaji: string | null; english: string | null }
  season: string | null
  seasonYear: number | null
  status: string | null
  startDate: { year: number | null; month: number | null }
  countryOfOrigin: string | null
}

async function fetchMedia(id: number, retries = 3): Promise<AniListMedia | null> {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { id } })
  })
  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
    console.log(`  rate-limited, retry in ${retryAfter}s`)
    await new Promise((r) => setTimeout(r, retryAfter * 1000))
    return fetchMedia(id, retries - 1)
  }
  if (!res.ok) throw new Error(`AniList ${res.status}: ${await res.text().catch(() => '')}`)
  const json = (await res.json()) as { data?: { Media: AniListMedia | null }; errors?: unknown }
  if (!json.data) {
    console.warn(`  id=${id} error: ${JSON.stringify(json.errors)}`)
    return null
  }
  return json.data.Media
}

// ---------------------------------------------------------------------------

const db = new Database(LOCAL_DB)

const orphans = db
  .prepare<{ anilist_id: number }, []>(
    `SELECT DISTINCT a.anilist_id
     FROM anime a
     LEFT JOIN anilist_media am ON am.id = a.anilist_id
     WHERE am.id IS NULL
     ORDER BY a.anilist_id`
  )
  .all()
  .map((r) => r.anilist_id)

console.log(`Orphan ids to backfill: ${orphans.length}`)

const upsert = db.prepare(
  `INSERT INTO anilist_media (
     id, title_native, title_romaji, title_english,
     season, season_year, status, start_year, start_month, country_of_origin,
     native_norm, romaji_norm, english_norm, synced_at
   ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET
     title_native=excluded.title_native,
     title_romaji=excluded.title_romaji,
     title_english=excluded.title_english,
     season=excluded.season,
     season_year=excluded.season_year,
     status=excluded.status,
     start_year=excluded.start_year,
     start_month=excluded.start_month,
     country_of_origin=excluded.country_of_origin,
     native_norm=excluded.native_norm,
     romaji_norm=excluded.romaji_norm,
     english_norm=excluded.english_norm,
     synced_at=excluded.synced_at`
)

const startTime = dayjs()
const stats = { ok: 0, missing: 0 }

for (const [i, id] of orphans.entries()) {
  await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS))
  const media = await fetchMedia(id)
  if (!media) {
    stats.missing += 1
    console.log(`  [${i + 1}/${orphans.length}] id=${id} not found on AniList`)
    continue
  }
  upsert.run(
    media.id,
    media.title.native,
    media.title.romaji,
    media.title.english,
    media.season,
    media.seasonYear,
    media.status ?? 'UNKNOWN',
    media.startDate.year,
    media.startDate.month,
    media.countryOfOrigin ?? 'JP',
    normalizeTitle(media.title.native) || null,
    normalizeTitle(media.title.romaji) || null,
    normalizeTitle(media.title.english) || null,
    dayjs().toISOString()
  )
  stats.ok += 1
  console.log(`  [${i + 1}/${orphans.length}] id=${id} ${media.title.native ?? media.title.romaji}`)
}

db.close()

const elapsed = dayjs().diff(startTime, 'second')
console.log()
console.log(`Done. ok=${stats.ok} missing=${stats.missing} in ${elapsed}s`)
