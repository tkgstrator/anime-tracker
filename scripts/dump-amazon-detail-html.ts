import { readdir } from 'node:fs/promises'
import { FETCH_HEADERS } from '../src/lib/providers/amazon/detail'

const DETAIL_BASE = 'https://www.amazon.co.jp/gp/video/detail'
const titlesDir = '__tests__/fixtures/amazon/titles'

const files = await readdir(titlesDir)
const titleIds = files.filter((f) => f.endsWith('.json')).map((f) => f.replace('.json', ''))

console.log(`Fetching ${titleIds.length} title detail pages...`)

for (const id of titleIds) {
  const url = `${DETAIL_BASE}/${id}`
  console.log(`  ${id} ...`)
  const res = await fetch(url, { headers: FETCH_HEADERS })
  if (!res.ok) {
    console.error(`    HTTP ${res.status} ${res.statusText}`)
    continue
  }
  const html = await res.text()
  const outPath = `${titlesDir}/${id}.html`
  await Bun.write(outPath, html)
  console.log(`    saved (${html.length} bytes)`)
}

console.log('Done.')
