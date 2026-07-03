#!/usr/bin/env bun
/**
 * Cloudflare Workers Observability から staging Worker のログを引き、
 * cron / provider / category ごとの実測差分レポートを組み立てる。
 *
 * API の 1 レスポンス上限 (1000 events) を回避するために、action ごとに分けて
 * query する。sync.ts が吐く INFO ログは 1 サイクルあたり数十件以下なので、
 * これで期間全体を安全に取り切れる。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import dayjs from 'dayjs'

const accountTag = process.env.CLOUDFLARE_ACCOUNT_ID
const token = process.env.CLOUDFLARE_API_TOKEN
if (!accountTag || !token) {
  console.error('CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN not set. source .env first.')
  process.exit(1)
}

const scriptName = process.argv[2] ?? 'anime-tracker-staging'
const sinceIso = process.argv[3] ?? new Date(Date.now() - 24 * 3600 * 1000).toISOString()
const untilIso = process.argv[4] ?? new Date().toISOString()
const outPath =
  process.argv[5] ?? `docs/reports/cron-actual-${dayjs().format('YYYY-MM-DD-HHmm')}.md`

interface RawEvent {
  timestamp: number
  level: string
  message: string
  logger: string
  properties: Record<string, unknown>
  eventType: string
  outcome: string
  cron?: string
  scheduledTime?: number
  requestId?: string
}

async function fetchAction(action: string, from: number, to: number): Promise<RawEvent[]> {
  const body = {
    queryId: 'workers-logs',
    timeframe: { from, to },
    parameters: {
      datasets: ['cloudflare-workers'],
      filters: [
        { key: '$metadata.service', type: 'string', operation: 'eq', value: scriptName },
        { key: 'properties.action', type: 'string', operation: 'eq', value: action }
      ],
      calculations: [],
      groupBys: [],
      havings: []
    },
    view: 'events',
    limit: 1000
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountTag}/workers/observability/telemetry/query`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }
  )
  if (!res.ok) throw new Error(`observability failed: ${res.status} ${(await res.text()).slice(0, 300)}`)
  const j = (await res.json()) as {
    result: {
      events: {
        count: number
        events: Array<{
          source: {
            level: string
            message: string
            logger?: string
            properties?: Record<string, unknown>
          }
          timestamp: number
          $workers: {
            eventType?: string
            outcome?: string
            event?: { cron?: string; scheduledTime?: number }
            requestId?: string
          }
        }>
      }
    }
  }
  return j.result.events.events.map((e) => ({
    timestamp: e.timestamp,
    level: e.source.level,
    message: e.source.message,
    logger: e.source.logger ?? '',
    properties: e.source.properties ?? {},
    eventType: e.$workers.eventType ?? '',
    outcome: e.$workers.outcome ?? '',
    cron: e.$workers.event?.cron,
    scheduledTime: e.$workers.event?.scheduledTime,
    requestId: e.$workers.requestId
  }))
}

// action ごとに 12 時間刻みで取得 (INFO の action 別なら 1000 に収まる)
async function fetchAll(action: string): Promise<RawEvent[]> {
  const step = 12 * 3600 * 1000
  const all: RawEvent[] = []
  for (let t = fromMs; t < toMs; t += step) {
    const end = Math.min(t + step, toMs)
    const batch = await fetchAction(action, t, end)
    all.push(...batch)
    if (batch.length >= 990) {
      console.log(`  ⚠ ${action} ${new Date(t).toISOString().slice(0, 16)}: ${batch.length} (truncated risk)`)
    }
  }
  return all
}

const fromMs = new Date(sinceIso).getTime()
const toMs = new Date(untilIso).getTime()

console.log(`Fetching logs: ${sinceIso} → ${untilIso}`)
console.log(`  scriptName: ${scriptName}`)
console.log()

// 集計対象 action 一覧
const ACTIONS = [
  'trigger',                    // cron 発火
  'enqueue',                    // cron→queue enqueue
  'enqueue-abema-archive',      // 0 4 * * *
  'enqueue-anilist-sync',       // 0 5 * * 0
  'fetch-start',                // provider fetch 開始 (queue message 単位)
  'check-titles',               // total/existing/unidentified/new
  'reset-badge',                // badge=null 戻し
  'update-expiring',            // expiredAt 更新
  'reset-expiring',             // expiredAt=null 戻し
  'fetch-title-list-done',      // identified/updateTargets/unidentifiedCreated
  'create-anime',               // 新規 Anime INSERT
  'create-season',              // 新規 Season INSERT
  'create-season-duplicate',    // Season UNIQUE スキップ
  'apply-detail-done',          // Anime detail applyDetail 完了 (episodesCreated/Updated 付き)
  'skip-coming-soon',           // new_episode で COMING_SOON 除外
  'expiring-cache-loaded'       // expiring 一覧受信
] as const

const eventsByAction = new Map<string, RawEvent[]>()
for (const action of ACTIONS) {
  process.stdout.write(`[${action}] `)
  const evs = await fetchAll(action)
  eventsByAction.set(action, evs)
  console.log(`${evs.length}`)
}

// ---- 集計 ---------------------------------------------------------------

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}
function num(v: unknown): number {
  return typeof v === 'number' ? v : 0
}

// [1] cron 発火
const cronRuns = new Map<string, number>()
for (const e of eventsByAction.get('trigger') ?? []) {
  if (e.cron) cronRuns.set(e.cron, (cronRuns.get(e.cron) ?? 0) + 1)
}

// [2] cron → provider × category の enqueue
const enqueueByCronPC = new Map<string, number>()
for (const e of eventsByAction.get('enqueue') ?? []) {
  const provider = str(e.properties.provider)
  const category = str(e.properties.category)
  const cron = e.cron ?? ''
  if (cron && provider && category) {
    const k = `${cron}|${provider}|${category}`
    enqueueByCronPC.set(k, (enqueueByCronPC.get(k) ?? 0) + 1)
  }
}
const abemaArchiveEnqueues = (eventsByAction.get('enqueue-abema-archive') ?? []).reduce(
  (sum, e) => sum + num(e.properties.count),
  0
)
const abemaArchiveRuns = (eventsByAction.get('enqueue-abema-archive') ?? []).length
const anilistSyncRuns = (eventsByAction.get('enqueue-anilist-sync') ?? []).length
const anilistSyncEnqueues = (eventsByAction.get('enqueue-anilist-sync') ?? []).reduce(
  (sum, e) => sum + num(e.properties.count),
  0
)

// [3] requestId → (provider, category) 対応表 (fetch-start から)
const requestPC = new Map<string, { provider: string; category: string }>()
for (const e of eventsByAction.get('fetch-start') ?? []) {
  const provider = str(e.properties.provider)
  const category = str(e.properties.category)
  if (e.requestId && provider && category) {
    requestPC.set(e.requestId, { provider, category })
  }
}

// [4] Provider × Category バケット
interface Bucket {
  provider: string
  category: string
  fetched: number
  existing: number
  unidentified: number
  newRaw: number
  identified: number
  updateTargets: number
  resetBadge: number
  updateExpiring: number
  resetExpiring: number
  createAnime: number
  createSeason: number
  createSeasonDup: number
  updateAnime: number
  episodesCreated: number
  episodesUpdated: number
  skipComingSoon: number
  fetchStart: number
}

const buckets = new Map<string, Bucket>()
function bkey(p: string, c: string): string {
  return `${p}|${c}`
}
function bucket(p: string, c: string): Bucket {
  const k = bkey(p, c)
  let b = buckets.get(k)
  if (!b) {
    b = {
      provider: p,
      category: c,
      fetched: 0,
      existing: 0,
      unidentified: 0,
      newRaw: 0,
      identified: 0,
      updateTargets: 0,
      resetBadge: 0,
      updateExpiring: 0,
      resetExpiring: 0,
      createAnime: 0,
      createSeason: 0,
      createSeasonDup: 0,
      updateAnime: 0,
      episodesCreated: 0,
      episodesUpdated: 0,
      skipComingSoon: 0,
      fetchStart: 0
    }
    buckets.set(k, b)
  }
  return b
}

function resolvePC(e: RawEvent): { provider: string; category: string } | null {
  const provider = str(e.properties.provider)
  const category = str(e.properties.category)
  if (provider && category) return { provider, category }
  const fromReq = e.requestId ? requestPC.get(e.requestId) : undefined
  if (fromReq) return fromReq
  if (provider) return { provider, category: 'unknown' }
  return null
}

// fetch-start をまず登録
for (const e of eventsByAction.get('fetch-start') ?? []) {
  const pc = resolvePC(e)
  if (pc) bucket(pc.provider, pc.category).fetchStart += 1
}

// check-titles
for (const e of eventsByAction.get('check-titles') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  const b = bucket(pc.provider, pc.category)
  b.fetched += num(e.properties.total)
  b.existing += num(e.properties.existing)
  b.unidentified += num(e.properties.unidentified)
  b.newRaw += num(e.properties.new)
}

// fetch-title-list-done
for (const e of eventsByAction.get('fetch-title-list-done') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  const b = bucket(pc.provider, pc.category)
  b.identified += num(e.properties.identified)
  b.updateTargets += num(e.properties.updateTargets)
}

// reset-badge (category 付いてる)
for (const e of eventsByAction.get('reset-badge') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  bucket(pc.provider, pc.category).resetBadge += num(e.properties.count)
}

// update-expiring / reset-expiring (category=expiring 固定)
for (const e of eventsByAction.get('update-expiring') ?? []) {
  const provider = str(e.properties.provider)
  if (!provider) continue
  bucket(provider, 'expiring').updateExpiring += num(e.properties.count)
}
for (const e of eventsByAction.get('reset-expiring') ?? []) {
  const provider = str(e.properties.provider)
  if (!provider) continue
  bucket(provider, 'expiring').resetExpiring += num(e.properties.count)
}

// skip-coming-soon
for (const e of eventsByAction.get('skip-coming-soon') ?? []) {
  const provider = str(e.properties.provider)
  if (!provider) continue
  bucket(provider, 'new_episode').skipComingSoon += num(e.properties.count)
}

// create-anime / create-season / create-season-duplicate / update
for (const e of eventsByAction.get('create-anime') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  bucket(pc.provider, pc.category).createAnime += 1
}
for (const e of eventsByAction.get('create-season') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  bucket(pc.provider, pc.category).createSeason += 1
}
for (const e of eventsByAction.get('create-season-duplicate') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  bucket(pc.provider, pc.category).createSeasonDup += 1
}
for (const e of eventsByAction.get('apply-detail-done') ?? []) {
  const pc = resolvePC(e)
  if (!pc) continue
  const b = bucket(pc.provider, pc.category)
  b.updateAnime += 1
  b.episodesCreated += num(e.properties.episodesCreated)
  b.episodesUpdated += num(e.properties.episodesUpdated)
}

// ---- レポート ------------------------------------------------------------

const cronMeaning: Record<string, string> = {
  '0 */1 * * *': '毎時: new_episode + coming_soon の enqueue',
  '0 0 * * *': '毎日 00:00 UTC (09:00 JST): expiring',
  '0 3 * * *': '毎日 03:00 UTC (12:00 JST): catalog',
  '0 4 * * *': '毎日 04:00 UTC (13:00 JST): ABEMA archive backfill',
  '0 5 * * SUN': '毎週日曜 05:00 UTC (14:00 JST): AniList media sync'
}

const lines: string[] = []
lines.push(`# Cron 実測レポート (${scriptName})`)
lines.push('')
lines.push(`- **対象期間**: ${sinceIso} 〜 ${untilIso}`)
lines.push(`- **データ源**: Cloudflare Workers Observability Logs`)
lines.push(`- **生成日時**: ${dayjs().format('YYYY-MM-DD HH:mm:ss')}`)
lines.push('')

lines.push('## 前提')
lines.push('')
lines.push('- 対象期間中に実際に staging Worker が吐いた INFO ログを集計したもの。**新規に叩き直したわけではない**。')
lines.push('- 「削除」の列は無い。`sync.ts` に anime / season / episode の DELETE は存在しないので構造的にゼロ。')
lines.push('- 「更新」は 2 種類に分けて表示している:')
lines.push('  - **badge reset / expiring reset** — 前回付いてたバッジや `expiredAt` が今回消えて null に戻された件数 (updateMany)')
lines.push('  - **Anime detail update** — 個別タイトルの詳細を取り直して Season/Episode を差分同期した回数 (applyDetail)')
lines.push('- Episode 単位の update (image / description / duration / releaseDate) は INFO ログを吐いていないので集計不可。')
lines.push('- Cloudflare Observability API は 1 レスポンス 1000 events 上限のため、action 別に分けて query している。⚠ 表示区間は取り漏らしの可能性あり。')
lines.push('')

lines.push('## Cron 発火実績')
lines.push('')
lines.push('| cron | 発火回数 | 意図 |')
lines.push('|---|---:|---|')
for (const [cron, n] of [...cronRuns].sort()) {
  lines.push(`| \`${cron}\` | ${n} | ${cronMeaning[cron] ?? '?'} |`)
}
lines.push('')

lines.push('## Cron ごとの enqueue 内訳')
lines.push('')
lines.push('| cron | provider | category | 回数 |')
lines.push('|---|---|---|---:|')
const sortedEnqueue = [...enqueueByCronPC.entries()].sort()
for (const [k, n] of sortedEnqueue) {
  const [cron, provider, category] = k.split('|')
  lines.push(`| \`${cron}\` | ${provider} | ${category} | ${n} |`)
}
if (abemaArchiveRuns > 0) {
  lines.push(`| \`0 4 * * *\` | abema | archive | ${abemaArchiveRuns} 回発火、合計 ${abemaArchiveEnqueues} 件 enqueue |`)
}
if (anilistSyncRuns > 0) {
  lines.push(`| \`0 5 * * SUN\` | anilist | year sync | ${anilistSyncRuns} 回発火、合計 ${anilistSyncEnqueues} 年分 enqueue |`)
}
lines.push('')

lines.push('## Provider × Category 別 差分実績')
lines.push('')
lines.push('| provider | category | fetched | 既存 | 未識別 | 生の new | 新規 Anime | 更新対象 | badge reset | expiring 更新 | expiring reset | Season 新規 | Season 重複 | applyDetail 実行 | Episode 新規 | Episode 更新 |')
lines.push('|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
const sortedBuckets = [...buckets.values()].sort((a, b) =>
  a.provider === b.provider ? a.category.localeCompare(b.category) : a.provider.localeCompare(b.provider)
)
for (const b of sortedBuckets) {
  lines.push(
    `| ${b.provider} | ${b.category} | ${b.fetched} | ${b.existing} | ${b.unidentified} | ${b.newRaw} | ${b.createAnime} | ${b.updateTargets} | ${b.resetBadge} | ${b.updateExpiring} | ${b.resetExpiring} | ${b.createSeason} | ${b.createSeasonDup} | ${b.updateAnime} | ${b.episodesCreated} | ${b.episodesUpdated} |`
  )
}
lines.push('')

// Provider 別サマリー
const perProvider = new Map<string, Bucket>()
for (const b of buckets.values()) {
  let agg = perProvider.get(b.provider)
  if (!agg) {
    agg = {
      provider: b.provider,
      category: 'all',
      fetched: 0,
      existing: 0,
      unidentified: 0,
      newRaw: 0,
      identified: 0,
      updateTargets: 0,
      resetBadge: 0,
      updateExpiring: 0,
      resetExpiring: 0,
      createAnime: 0,
      createSeason: 0,
      createSeasonDup: 0,
      updateAnime: 0,
      episodesCreated: 0,
      episodesUpdated: 0,
      skipComingSoon: 0,
      fetchStart: 0
    }
    perProvider.set(b.provider, agg)
  }
  agg.fetched += b.fetched
  agg.existing += b.existing
  agg.unidentified += b.unidentified
  agg.newRaw += b.newRaw
  agg.identified += b.identified
  agg.updateTargets += b.updateTargets
  agg.resetBadge += b.resetBadge
  agg.updateExpiring += b.updateExpiring
  agg.resetExpiring += b.resetExpiring
  agg.createAnime += b.createAnime
  agg.createSeason += b.createSeason
  agg.createSeasonDup += b.createSeasonDup
  agg.updateAnime += b.updateAnime
  agg.episodesCreated += b.episodesCreated
  agg.episodesUpdated += b.episodesUpdated
}
lines.push('## Provider 別 合計 (期間中)')
lines.push('')
lines.push('| provider | fetched | 既存 | 未識別 | 生の new | 新規 Anime | badge reset | expiring 更新 | Season 新規 | applyDetail 実行 | Episode 新規 | Episode 更新 |')
lines.push('|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|')
for (const b of [...perProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider))) {
  lines.push(
    `| ${b.provider} | ${b.fetched} | ${b.existing} | ${b.unidentified} | ${b.newRaw} | ${b.createAnime} | ${b.resetBadge} | ${b.updateExpiring} | ${b.createSeason} | ${b.updateAnime} | ${b.episodesCreated} | ${b.episodesUpdated} |`
  )
}
lines.push('')

lines.push('## 列の意味')
lines.push('')
lines.push('| 列 | 元 action | 意味 |')
lines.push('|---|---|---|')
lines.push('| fetched | `check-titles.total` | Lambda が返した title 総数 |')
lines.push('| 既存 | `check-titles.existing` | fetched のうち `anime` に既にあるもの (badge/日付が上書き) |')
lines.push('| 未識別 | `check-titles.unidentified` | `unidentified_anime` にあるもの |')
lines.push('| 生の new | `check-titles.new` | fetched - existing - unidentified (識別前の値) |')
lines.push('| 新規 Anime | `create-anime` | AniList 識別が通り `anime` に INSERT された件数 |')
lines.push('| 更新対象 | `fetch-title-list-done.updateTargets` | badge 付き既存 anime → detail update queue に流す件数 |')
lines.push('| badge reset | `reset-badge.count` | badge が今回消えて null に戻された件数 |')
lines.push('| expiring 更新 | `update-expiring.count` | `expiredAt` を更新した件数 |')
lines.push('| expiring reset | `reset-expiring.count` | `expiredAt` が消えて null に戻された件数 |')
lines.push('| Season 新規 | `create-season` | 新しい Season を作成した回数 |')
lines.push('| Season 重複 | `create-season-duplicate` | UNIQUE 制約でスキップされた回数 |')
lines.push('| applyDetail 実行 | `apply-detail-done` | update queue で個別 anime detail を取り直した回数 |')
lines.push('| Episode 新規 | `apply-detail-done.episodesCreated` | applyDetail 中に作成された Episode の合計 |')
lines.push('| Episode 更新 | `apply-detail-done.episodesUpdated` | applyDetail 中に image/description/duration/releaseDate が変わって update された Episode の合計 |')
lines.push('')

lines.push('## 集計の限界')
lines.push('')
lines.push('- **削除は 0 件確定**。')
lines.push('- 「新規 Anime」と「Season 新規」は provider (+ category が resolvable なら category) にひもづく。resolvable じゃない update queue 経由分は `category=unknown` に集約される。')

const report = lines.join('\n')
mkdirSync(dirname(outPath), { recursive: true })
writeFileSync(outPath, report)
console.log(`\nReport written to ${outPath}`)
