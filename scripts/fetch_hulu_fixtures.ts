/**
 * Hulu テスト用フィクスチャ (HTML + JSON) を生成するスクリプト。
 *
 * Usage: bun run scripts/fetch_hulu_fixtures.ts
 */
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fetchHuluTitleDetail } from '../src/lib/providers/hulu/detail'

const SLUGS = [
  'spy-family',
  'blue-lock',
  'oshi-no-ko',
  'frieren-beyond-journeys-end',
  'my-dress-up-darling',
]

const FIXTURES_DIR = resolve(import.meta.dir, '../__tests__/fixtures/hulu/titles')

async function main() {
  for (const slug of SLUGS) {
    console.log(`Fetching ${slug}...`)

    // HTML を取得
    const url = `https://www.hulu.jp/${slug}/assets?ht=episode`
    const res = await fetch(url)
    if (!res.ok) {
      console.error(`  SKIP: ${res.status} ${res.statusText}`)
      continue
    }
    const html = await res.text()
    writeFileSync(resolve(FIXTURES_DIR, `${slug}.html`), html)
    console.log(`  HTML saved (${(html.length / 1024).toFixed(0)} KB)`)

    // パース結果を JSON として保存
    const detail = await fetchHuluTitleDetail(slug)
    writeFileSync(resolve(FIXTURES_DIR, `${slug}.json`), JSON.stringify(detail, null, 2))
    console.log(`  JSON saved (${detail.seasons.reduce((n, s) => n + s.episodes.length, 0)} episodes)`)
  }
}

main().catch(console.error)
