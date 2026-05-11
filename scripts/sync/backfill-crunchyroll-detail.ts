#!/usr/bin/env bun
/**
 * Crunchyroll の全タイトル (anime テーブルにある content_id) について、
 * bun runtime で local Lambda handler を直叩きして TitleInfo を取得し、
 * 結果を bun:sqlite で D1 ローカル DB に upsert する。
 *
 * Workerd 経由 (= /api/queues bulk_update) だと Crunchyroll が 403 を返す
 * (Bun の TLS fingerprint が必要)。AWS Lambda US でも環境によっては blocked
 * になることがあるため、devcontainer を VPN 経由で接続している前提で実行する。
 *
 * Usage:
 *   bun scripts/sync/backfill-crunchyroll-detail.ts                # 全件
 *   bun scripts/sync/backfill-crunchyroll-detail.ts CONTENT_ID...  # 指定のみ
 *   CONCURRENCY=5 bun scripts/sync/backfill-crunchyroll-detail.ts  # 並列度
 */
import { Database } from 'bun:sqlite'
import dayjs from 'dayjs'
import { v5 as uuidv5 } from 'uuid'
import { handler } from '../../lambda/fetch/index'
import type { TitleInfo } from '../../src/schemas/providers/common.dto'

const LOCAL_DB =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const PROVIDER = 'crunchyroll'
const NAMESPACE = uuidv5('animetracker', uuidv5.DNS)
const CONCURRENCY = Number(process.env.CONCURRENCY ?? '3')

const animeUuid = (contentId: string) => uuidv5(`${PROVIDER}:${contentId}`, NAMESPACE)
const seasonUuid = (contentId: string, seasonStableId: string) =>
  uuidv5(`${PROVIDER}:${contentId}:${seasonStableId}`, NAMESPACE)
const episodeUuid = (contentId: string, seasonStableId: string, episodeNumber: number) =>
  uuidv5(`${PROVIDER}:${contentId}:${seasonStableId}:${episodeNumber}`, NAMESPACE)

async function fetchDetail(contentId: string): Promise<TitleInfo> {
  const event = { rawPath: '/title_info', body: JSON.stringify({ provider: PROVIDER, contentId }) }
  const res = await handler(event)
  if (res.statusCode !== 200) throw new Error(`Lambda ${res.statusCode}: ${res.body.slice(0, 200)}`)
  return JSON.parse(res.body) as TitleInfo
}

interface ApplyCounters {
  seasonsInserted: number
  episodesInserted: number
  episodesUpdated: number
}

function applyDetail(db: Database, contentId: string, detail: TitleInfo): ApplyCounters {
  const counters: ApplyCounters = { seasonsInserted: 0, episodesInserted: 0, episodesUpdated: 0 }
  const animeId = animeUuid(contentId)
  const animeRow = db
    .prepare<{ id: string }, [string]>("SELECT id FROM anime WHERE provider = 'crunchyroll' AND content_id = ?")
    .get(contentId)
  if (!animeRow) throw new Error(`anime row not found for contentId=${contentId}`)
  const animeDbId = animeRow.id

  const now = dayjs().toISOString()
  db.prepare<unknown, [string, string]>('UPDATE anime SET description = ?, updated_at = ? WHERE id = ?').run(
    detail.description,
    now,
    animeDbId
  )

  // 既存 episodes を season_number 単位で読み込む
  type ExistingEp = {
    id: string
    season_number: number
    episode_number: number
    image_url: string
    description: string
    duration: number
    release_date: string
  }
  const existingEpisodes = new Map<number, Map<number, ExistingEp>>()
  for (const row of db
    .prepare<ExistingEp, [string]>(`
      SELECT e.id, s.season_number, e.episode_number, e.image_url, e.description, e.duration, e.release_date
      FROM episodes e
      JOIN seasons s ON s.id = e.season_id
      WHERE s.anime_id = ?
    `)
    .all(animeDbId)) {
    const inner = existingEpisodes.get(row.season_number) ?? new Map<number, ExistingEp>()
    inner.set(row.episode_number, row)
    existingEpisodes.set(row.season_number, inner)
  }

  const insertSeason = db.prepare(
    'INSERT OR IGNORE INTO seasons (id, anime_id, season_id, display_name, season_number, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  )
  const insertEpisode = db.prepare(
    `INSERT OR IGNORE INTO episodes (
       id, season_id, episode_number, episode_id, title, description, release_date,
       duration, maturity_rating, image_url, has_subtitles, has_dub, benefit_id, recorded, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
  )
  const updateEpisode = db.prepare(
    'UPDATE episodes SET image_url = ?, description = ?, duration = ?, release_date = ? WHERE id = ?'
  )
  const findSeasonByNumber = db.prepare<{ id: string }, [string, number]>(
    'SELECT id FROM seasons WHERE anime_id = ? AND season_number = ?'
  )

  for (const season of detail.seasons) {
    const existingForSeason = existingEpisodes.get(season.seasonNumber)
    const sUuid = seasonUuid(contentId, season.seasonId)

    if (!existingForSeason) {
      const r = insertSeason.run(sUuid, animeDbId, season.seasonId, season.displayName, season.seasonNumber, now)
      if (r.changes > 0) counters.seasonsInserted += 1
      // 新規シーズン → 全エピソードを INSERT
      for (const ep of season.episodes) {
        const epId = episodeUuid(contentId, season.seasonId, ep.episodeNumber)
        const ins = insertEpisode.run(
          epId,
          sUuid,
          ep.episodeNumber,
          ep.episodeId,
          ep.title,
          ep.description,
          ep.releaseDate,
          ep.duration,
          ep.maturityRating,
          ep.imageUrl,
          ep.hasSubtitles ? 1 : 0,
          ep.hasDub ? 1 : 0,
          ep.benefitId,
          now
        )
        if (ins.changes > 0) counters.episodesInserted += 1
      }
      continue
    }

    // 既存シーズン → episode 単位で diff
    const dbSeason = findSeasonByNumber.get(animeDbId, season.seasonNumber)
    if (!dbSeason) continue
    for (const ep of season.episodes) {
      const existing = existingForSeason.get(ep.episodeNumber)
      if (!existing) {
        const epId = episodeUuid(contentId, season.seasonId, ep.episodeNumber)
        const ins = insertEpisode.run(
          epId,
          dbSeason.id,
          ep.episodeNumber,
          ep.episodeId,
          ep.title,
          ep.description,
          ep.releaseDate,
          ep.duration,
          ep.maturityRating,
          ep.imageUrl,
          ep.hasSubtitles ? 1 : 0,
          ep.hasDub ? 1 : 0,
          ep.benefitId,
          now
        )
        if (ins.changes > 0) counters.episodesInserted += 1
        continue
      }
      // metadata diff
      if (
        existing.image_url !== ep.imageUrl ||
        existing.description !== ep.description ||
        existing.duration !== ep.duration ||
        existing.release_date !== ep.releaseDate
      ) {
        updateEpisode.run(ep.imageUrl, ep.description, ep.duration, ep.releaseDate, existing.id)
        counters.episodesUpdated += 1
      }
    }
  }

  return counters
}

async function main() {
  const db = new Database(LOCAL_DB)
  const args = process.argv.slice(2)
  const targets: string[] =
    args.length > 0
      ? args
      : db
          .prepare<{ content_id: string }, [string]>("SELECT content_id FROM anime WHERE provider = ? ORDER BY title")
          .all(PROVIDER)
          .map((r) => r.content_id)
  console.log(`targets: ${targets.length} (concurrency=${CONCURRENCY})`)

  const totals = { ok: 0, fail: 0, seasonsIns: 0, episodesIns: 0, episodesUpd: 0 }
  const start = dayjs()

  // 並列実行 (concurrent worker パターン)
  const queue = [...targets]
  const workers = Array.from({ length: CONCURRENCY }, async (_, w) => {
    while (true) {
      const contentId = queue.shift()
      if (!contentId) break
      const i = targets.length - queue.length
      try {
        const detail = await fetchDetail(contentId)
        const c = applyDetail(db, contentId, detail)
        totals.ok += 1
        totals.seasonsIns += c.seasonsInserted
        totals.episodesIns += c.episodesInserted
        totals.episodesUpd += c.episodesUpdated
        if (i % 20 === 0 || c.episodesInserted > 0) {
          const elapsed = dayjs().diff(start, 'second')
          console.log(
            `[w${w}] ${i}/${targets.length} ${contentId} +${c.episodesInserted}ep ~${c.episodesUpdated}ep (elapsed ${elapsed}s)`
          )
        }
      } catch (e) {
        totals.fail += 1
        console.error(`[w${w}] ${i}/${targets.length} ${contentId} FAIL: ${(e as Error).message}`)
      }
    }
  })
  await Promise.all(workers)

  const elapsed = dayjs().diff(start, 'second')
  console.log('\n=== summary ===')
  console.log(`  ok:                ${totals.ok}`)
  console.log(`  fail:              ${totals.fail}`)
  console.log(`  seasons inserted:  ${totals.seasonsIns}`)
  console.log(`  episodes inserted: ${totals.episodesIns}`)
  console.log(`  episodes updated:  ${totals.episodesUpd}`)
  console.log(`  elapsed:           ${elapsed}s`)
  db.close()
}

await main()
