#!/usr/bin/env bun
/**
 * unidentified_anime.image_url の backfill。
 * 各プロバイダの catalog を Lambda handler ローカル実行で取得し、contentId が
 * 一致する unidentified 行に image_url を埋める。
 *
 * Usage:
 *   bun scripts/sync/backfill-unidentified-image.ts                       # 全プロバイダ (lambda local)
 *   bun scripts/sync/backfill-unidentified-image.ts amazon                # 指定プロバイダのみ
 *   bun scripts/sync/backfill-unidentified-image.ts --remote hulu         # AWS Lambda 経由 (JP IP)
 */
import { Database } from 'bun:sqlite'
import { unlinkSync } from 'node:fs'
import dayjs from 'dayjs'
import { handler } from '../../lambda/fetch/index'
import type { Title } from '../../src/schemas/providers/common.dto'

const LOCAL_DB =
  '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/c289ae8601b8c4b5b07e7123fe2ec79ba670a1ad0ce6f48c80d8b0b231d2555f.sqlite'

const ALL_PROVIDERS = ['abema', 'hulu', 'amazon'] as const
type Provider = (typeof ALL_PROVIDERS)[number]

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith('-')))
const useRemote = flags.has('--remote')

const args = process.argv.slice(2).filter((a) => !a.startsWith('-'))
const targets: Provider[] =
  args.length === 0
    ? [...ALL_PROVIDERS]
    : args.filter((a): a is Provider => (ALL_PROVIDERS as readonly string[]).includes(a))

if (targets.length === 0) {
  console.error(`Unknown provider. Valid: ${ALL_PROVIDERS.join(', ')}`)
  process.exit(1)
}

async function fetchCatalogLocal(provider: Provider): Promise<Title[]> {
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

async function fetchCatalogRemote(provider: Provider): Promise<Title[]> {
  const region = provider === 'amazon' || provider === 'hulu' || provider === 'abema' ? 'ap-northeast-1' : 'us-east-1'
  const fn = provider === 'amazon' || provider === 'hulu' || provider === 'abema' ? 'anime-tracker-fetch' : 'anime-tracker-fetch-us'
  const payload = JSON.stringify({ rawPath: '/title_list', body: JSON.stringify({ provider, category: 'catalog' }) })
  const out = `/tmp/lambda-${provider}-${Date.now()}.json`
  console.log(`[${provider}] invoking AWS Lambda ${fn} (${region})...`)
  const start = dayjs()
  const proc = Bun.spawnSync({
    cmd: [
      'aws', 'lambda', 'invoke',
      '--function-name', fn,
      '--region', region,
      '--cli-binary-format', 'raw-in-base64-out',
      '--payload', payload,
      '--output', 'json',
      out
    ],
    stdout: 'pipe',
    stderr: 'pipe'
  })
  if (proc.exitCode !== 0) {
    throw new Error(`[${provider}] aws lambda invoke failed: ${proc.stderr.toString()}`)
  }
  const raw = await Bun.file(out).text()
  unlinkSync(out)
  const wrapper = JSON.parse(raw) as { statusCode: number; body: string }
  if (wrapper.statusCode !== 200) {
    throw new Error(`[${provider}] lambda response ${wrapper.statusCode}: ${wrapper.body.slice(0, 300)}`)
  }
  const body = JSON.parse(wrapper.body) as { entries: Title[] }
  const ms = dayjs().diff(start, 'millisecond')
  console.log(`[${provider}] fetched ${body.entries.length} entries in ${(ms / 1000).toFixed(1)}s`)
  return body.entries
}

const fetchCatalog = (provider: Provider): Promise<Title[]> =>
  useRemote ? fetchCatalogRemote(provider) : fetchCatalogLocal(provider)

function backfillProvider(provider: Provider, entries: Title[], db: Database): number {
  const imageByContentId = new Map<string, string>()
  for (const t of entries) {
    if (t.contentId && t.imageUrl) imageByContentId.set(t.contentId, t.imageUrl)
  }

  const rows = db
    .prepare<{ id: string; content_id: string }, [string]>(
      "SELECT id, content_id FROM unidentified_anime WHERE provider = ? AND image_url IS NULL"
    )
    .all(provider)
  console.log(`[${provider}] unidentified rows missing image: ${rows.length}, catalog entries: ${imageByContentId.size}`)

  const update = db.prepare<unknown, [string, string]>(
    'UPDATE unidentified_anime SET image_url = ?, updated_at = updated_at WHERE id = ?'
  )

  const tx = db.transaction(() => {
    const updated = rows.reduce((acc, row) => {
      const img = imageByContentId.get(row.content_id)
      if (!img) return acc
      update.run(img, row.id)
      return acc + 1
    }, 0)
    return updated
  })
  const updated = tx()
  console.log(`[${provider}] backfilled ${updated} / ${rows.length} rows`)
  return updated
}

async function main() {
  const db = new Database(LOCAL_DB)
  try {
    const totals = await targets.reduce<Promise<{ updated: number; provider: Provider }[]>>(async (accP, provider) => {
      const acc = await accP
      const entries = await fetchCatalog(provider)
      const updated = backfillProvider(provider, entries, db)
      return [...acc, { provider, updated }]
    }, Promise.resolve([]))

    console.log('\n=== summary ===')
    for (const t of totals) console.log(`  ${t.provider}: +${t.updated} image_url`)
  } finally {
    db.close()
  }
}

await main()
