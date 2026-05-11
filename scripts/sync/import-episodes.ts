#!/usr/bin/env bun
/**
 * D1 の識別済み anime に対して、provider からエピソード詳細を取って seasons/episodes
 * テーブルに書き込む。SyncService.applyDetail の bun:sqlite 版。
 *
 * - デフォルトでは seasons 行がまだない anime のみ対象 (新規取り込み)
 * - --force でも既存 anime を含めて全件対象（差分追加のみ、削除はしない）
 * - --provider で特定プロバイダのみ
 * - --limit N で N 件まで
 * - --concurrency N で並列度 (デフォルト 5)
 *
 * Usage:
 *   bun scripts/sync/import-episodes.ts                       # 未取得分のみ全プロバイダ
 *   bun scripts/sync/import-episodes.ts --provider=hulu       # hulu のみ
 *   bun scripts/sync/import-episodes.ts --limit=10            # テスト用に 10 件
 *   bun scripts/sync/import-episodes.ts --force --provider=amazon
 */
import { Database } from 'bun:sqlite'
import { randomUUID } from 'node:crypto'
import { parseArgs } from 'node:util'
import dayjs from 'dayjs'
import { AbemaProvider } from '../../src/lib/providers/abema'
import { AmazonProvider } from '../../src/lib/providers/amazon'
import type { Provider } from '../../src/lib/providers/base'
import { HuluProvider } from '../../src/lib/providers/hulu'
import type { Episode, Season, TitleInfo } from '../../src/schemas/providers/common.dto'

const LOCAL_DB = '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

// crunchyroll は VPN 必須なのでローカル不可
const PROVIDERS: Record<string, Provider> = {
  abema: new AbemaProvider(),
  amazon: new AmazonProvider(),
  hulu: new HuluProvider()
}

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    provider: { type: 'string' },
    limit: { type: 'string' },
    concurrency: { type: 'string', default: '5' },
    delay: { type: 'string', default: '0' },
    force: { type: 'boolean', default: false },
    'only-bad-images': { type: 'boolean', default: false }
  }
})

const providerFilter = values.provider
const limit = values.limit ? Number.parseInt(values.limit, 10) : undefined
const concurrency = Number.parseInt(values.concurrency!, 10)
const delayMs = Number.parseInt(values.delay!, 10)
const force = values.force
const onlyBadImages = values['only-bad-images']

// ---------------------------------------------------------------------------

interface AnimeRow {
  id: string
  provider: string
  content_id: string
  title: string
}

function loadAnimeToProcess(db: Database): AnimeRow[] {
  const conditions: string[] = []
  const params: (string | number)[] = []

  if (onlyBadImages) {
    // 同一 season 内で全 episode が同じ image_url を持っているような anime のみ対象
    conditions.push(`EXISTS (
       SELECT 1 FROM seasons s
       JOIN (
         SELECT season_id FROM episodes
         GROUP BY season_id
         HAVING COUNT(*) > 1 AND COUNT(DISTINCT image_url) = 1
       ) bad ON bad.season_id = s.id
       WHERE s.anime_id = a.id
     )`)
  } else if (!force) {
    conditions.push('NOT EXISTS (SELECT 1 FROM seasons s WHERE s.anime_id = a.id)')
  }
  if (providerFilter) {
    conditions.push('a.provider = ?')
    params.push(providerFilter)
  }
  // crunchyroll はローカル不可なので除外
  conditions.push("a.provider != 'crunchyroll'")
  // 空タイトルは識別失敗扱い、除外
  conditions.push("a.title != ''")

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const limitSql = limit ? ` LIMIT ${limit}` : ''
  const sql = `SELECT a.id, a.provider, a.content_id, a.title FROM anime a ${where} ORDER BY a.provider, a.content_id${limitSql}`

  return db.prepare<AnimeRow, (string | number)[]>(sql).all(...params)
}

function upsertSeasonsAndEpisodes(db: Database, animeId: string, seasons: Season[], existingDescription: string, newDescription: string): void {
  // description 更新
  if (newDescription && newDescription !== existingDescription) {
    db.prepare('UPDATE anime SET description = ?, updated_at = ? WHERE id = ?').run(newDescription, dayjs().toISOString(), animeId)
  }

  // 既存 seasons / episodes を読み込み
  const existingSeasons = db
    .prepare<{ id: string; season_id: string; season_number: number }, [string]>(
      'SELECT id, season_id, season_number FROM seasons WHERE anime_id = ?'
    )
    .all(animeId)
  const seasonByNumber = new Map(existingSeasons.map((s) => [s.season_number, s]))

  const insertSeason = db.prepare(
    `INSERT OR IGNORE INTO seasons (id, anime_id, season_id, display_name, season_number, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  )
  // --force 時に既存 episode を上書きできるよう ON CONFLICT で UPDATE
  const insertEpisode = db.prepare(
    `INSERT INTO episodes (
       id, season_id, episode_number, episode_id, title, description,
       release_date, duration, maturity_rating, image_url, has_subtitles, has_dub,
       benefit_id, recorded, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(season_id, episode_number) DO UPDATE SET
       episode_id = excluded.episode_id,
       title = excluded.title,
       description = excluded.description,
       release_date = excluded.release_date,
       duration = excluded.duration,
       maturity_rating = excluded.maturity_rating,
       image_url = excluded.image_url,
       has_subtitles = excluded.has_subtitles,
       has_dub = excluded.has_dub,
       benefit_id = excluded.benefit_id`
  )

  for (const season of seasons) {
    const ts = dayjs().toISOString()
    const existing = seasonByNumber.get(season.seasonNumber)
    const seasonRowId = existing?.id ?? randomUUID()
    if (!existing) {
      insertSeason.run(seasonRowId, animeId, season.seasonId, season.displayName, season.seasonNumber, ts)
    }

    for (const ep of season.episodes) {
      // INSERT は UPSERT (ON CONFLICT UPDATE) なので存在チェック不要
      insertEpisode.run(
        randomUUID(),
        seasonRowId,
        ep.episodeNumber,
        ep.episodeId,
        ep.title,
        ep.description,
        dayjs(ep.releaseDate).toISOString(),
        ep.duration,
        ep.maturityRating,
        ep.imageUrl,
        ep.hasSubtitles ? 1 : 0,
        ep.hasDub ? 1 : 0,
        ep.benefitId,
        ts
      )
    }
  }
}

interface ProcessResult {
  status: 'ok' | 'fail'
  error?: string
  seasons?: number
  episodes?: number
}

async function processOne(db: Database, row: AnimeRow): Promise<ProcessResult> {
  const provider = PROVIDERS[row.provider]
  if (!provider) return { status: 'fail', error: `no provider for ${row.provider}` }

  const detail: TitleInfo = await provider.fetchTitleInfo(row.content_id)
  const totalEpisodes = detail.seasons.reduce((sum, s) => sum + s.episodes.length, 0)

  const tx = db.transaction(() => {
    upsertSeasonsAndEpisodes(db, row.id, detail.seasons, '', detail.description)
  })
  tx()

  return { status: 'ok', seasons: detail.seasons.length, episodes: totalEpisodes }
}

// ---------------------------------------------------------------------------

const db = new Database(LOCAL_DB)
const animeList = loadAnimeToProcess(db)
console.log(`Target: ${animeList.length} anime`)
console.log(`Concurrency: ${concurrency}, force: ${force}, providerFilter: ${providerFilter ?? '(all)'}`)
console.log()

if (animeList.length === 0) {
  console.log('Nothing to do.')
  db.close()
  process.exit(0)
}

const startedAt = dayjs()
const counts = { ok: 0, fail: 0, seasons: 0, episodes: 0 }

for (let i = 0; i < animeList.length; i += concurrency) {
  if (i > 0 && delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs))
  }
  const chunk = animeList.slice(i, i + concurrency)
  const results = await Promise.allSettled(chunk.map((row) => processOne(db, row)))

  for (const [j, r] of results.entries()) {
    const row = chunk[j]
    if (r.status === 'fulfilled' && r.value.status === 'ok') {
      counts.ok += 1
      counts.seasons += r.value.seasons ?? 0
      counts.episodes += r.value.episodes ?? 0
    } else {
      counts.fail += 1
      const error = r.status === 'rejected' ? (r.reason instanceof Error ? r.reason.message : String(r.reason)) : r.value.error
      console.warn(`[${row.provider}/${row.content_id}] FAIL: ${error}`)
    }
  }

  const done = i + chunk.length
  const pct = ((done / animeList.length) * 100).toFixed(1)
  const elapsed = dayjs().diff(startedAt, 'second')
  console.log(`progress ${done}/${animeList.length} (${pct}%) ok=${counts.ok} fail=${counts.fail} seasons=${counts.seasons} eps=${counts.episodes} ${elapsed}s`)
}

db.close()

const total = dayjs().diff(startedAt, 'second')
console.log()
console.log(`Done. total=${total}s, ok=${counts.ok}, fail=${counts.fail}, seasons=${counts.seasons}, episodes=${counts.episodes}`)
