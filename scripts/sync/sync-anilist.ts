#!/usr/bin/env bun
/**
 * AniList の JP アニメを年単位で全件 dump して local D1 の anilist_media に upsert。
 *
 * AniList の search backend が壊れていても、Page { media(seasonYear:, countryOfOrigin: ...) }
 * 系の filter は動くので、年で chunk して全件取れる。client-side で title マッチング
 * に使う想定。
 *
 * Usage:
 *   bun scripts/sync/sync-anilist.ts                # default: 2000-(今年+1)
 *   bun scripts/sync/sync-anilist.ts --from=2020 --to=2026
 *   bun scripts/sync/sync-anilist.ts --country=CN
 */
import { Database } from 'bun:sqlite'
import { parseArgs } from 'node:util'
import dayjs from 'dayjs'
import { normalizeTitle } from '../../src/lib/metadata/normalize'

const ANILIST_API = 'https://graphql.anilist.co'
const PER_PAGE = 50
/** AniList は現状 30 req/min に degrade。安全側で 1500ms */
const REQUEST_INTERVAL_MS = 1500
const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    from: { type: 'string', default: '2000' },
    to: { type: 'string', default: String(dayjs().year() + 1) },
    country: { type: 'string', default: 'JP' }
  }
})

const fromYear = Number.parseInt(values.from!, 10)
const toYear = Number.parseInt(values.to!, 10)
const country = values.country!

const QUERY = `query ($year: Int, $page: Int, $perPage: Int, $country: CountryCode) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, seasonYear: $year, countryOfOrigin: $country) {
      id
      title { native romaji english }
      season
      seasonYear
      status
      startDate { year month }
    }
  }
}`

interface AniListEntry {
  id: number
  title: { native: string | null; romaji: string | null; english: string | null }
  season: string | null
  seasonYear: number | null
  status: string | null
  startDate: { year: number | null; month: number | null }
}

async function fetchPage(year: number, page: number, retries = 3): Promise<{ hasNextPage: boolean; media: AniListEntry[] }> {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query: QUERY, variables: { year, page, perPage: PER_PAGE, country } })
  })

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
    console.log(`  rate-limited, retry in ${retryAfter}s`)
    await new Promise((r) => setTimeout(r, retryAfter * 1000))
    return fetchPage(year, page, retries - 1)
  }
  if (!res.ok) {
    throw new Error(`AniList ${res.status}: ${await res.text().catch(() => '')}`)
  }

  const json = (await res.json()) as {
    data?: { Page: { pageInfo: { hasNextPage: boolean }; media: AniListEntry[] } }
    errors?: unknown
  }
  if (!json.data) throw new Error(`AniList error: ${JSON.stringify(json.errors)}`)
  return { hasNextPage: json.data.Page.pageInfo.hasNextPage, media: json.data.Page.media }
}

// ---------------------------------------------------------------------------

const db = new Database(LOCAL_DB)

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

const writeBatch = db.transaction((entries: AniListEntry[]) => {
  const ts = dayjs().toISOString()
  for (const e of entries) {
    upsert.run(
      e.id,
      e.title.native,
      e.title.romaji,
      e.title.english,
      e.season,
      e.seasonYear,
      e.status ?? 'UNKNOWN',
      e.startDate.year,
      e.startDate.month,
      country,
      normalizeTitle(e.title.native) || null,
      normalizeTitle(e.title.romaji) || null,
      normalizeTitle(e.title.english) || null,
      ts
    )
  }
})

console.log(`Syncing AniList: country=${country} years=${fromYear}-${toYear}`)
console.log(`Local D1: ${LOCAL_DB}`)
console.log()

const startTime = dayjs()
const totals = { fetched: 0, years: 0 }

for (const year of Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)) {
  const yearStart = totals.fetched
  for (const page of Array.from({ length: 100 }, (_, i) => i + 1)) {
    await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS))
    const { hasNextPage, media } = await fetchPage(year, page)
    if (media.length === 0) break
    writeBatch(media)
    totals.fetched += media.length
    if (!hasNextPage) break
  }
  totals.years += 1
  console.log(`  ${year}: +${totals.fetched - yearStart} entries (total ${totals.fetched})`)
}

db.close()

const elapsed = dayjs().diff(startTime, 'second')
console.log()
console.log(`Done. ${totals.fetched} entries across ${totals.years} years in ${elapsed}s`)
