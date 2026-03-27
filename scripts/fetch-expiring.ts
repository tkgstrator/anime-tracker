/**
 * 配信終了間近タイトル一覧を取得して KV に JSON で保存するスクリプト。
 *
 * GitHub Actions (日本IP) から実行し、Cloudflare Workers (海外IP) では
 * 取得できない配信終了メッセージを含むデータを KV 経由で渡す。
 *
 * KV への保存は wrangler を使用する。
 *
 * Usage:
 *   bun run scripts/fetch-expiring.ts [--env staging|production]
 */
import { execSync } from 'node:child_process'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AmazonProvider } from '../src/lib/providers/amazon'

dayjs.extend(utc)

const KV_KEY = 'browse:expiring:latest'
const envFlag = process.argv.includes('--env') ? process.argv[process.argv.indexOf('--env') + 1] : 'staging'

const provider = new AmazonProvider()
console.log('Fetching expiring titles...')
const titles = await provider.fetchTitleList({ expiringOnly: true })
console.log(`Fetched ${titles.length} titles`)

const now = dayjs()
const entries = titles
  .filter((t) => t.expiring)
  .map((t) => {
    const raw = now.add(t.expiring!.remainingHours, 'hour')
    const expiredAt = raw.utcOffset(9).startOf('day').toISOString()
    return {
      contentId: t.contentId,
      expiredAt,
      expiringSeason: t.expiring!.season
    }
  })

console.log(`With expiring info: ${entries.length}`)

if (entries.length === 0) {
  console.error('No titles with expiring info found, aborting')
  process.exit(1)
}

const json = JSON.stringify({ fetchedAt: now.toISOString(), entries })
const tmpFile = '/tmp/fetch-expiring.json'
await Bun.write(tmpFile, json)

execSync(`bunx wrangler kv key put "${KV_KEY}" --path="${tmpFile}" --binding=KV --env=${envFlag} --remote`, {
  stdio: 'inherit'
})

console.log(`Saved ${entries.length} entries to KV: ${KV_KEY}`)
