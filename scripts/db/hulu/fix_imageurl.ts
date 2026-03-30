/**
 * Hulu フィクスチャの imageUrl が空のものに対して Falcor API から thumbnailUrl を取得して補完する。
 */
import { readdirSync, readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { fetchSeriesMeta } from '../../../src/lib/providers/hulu/detail'

const FIXTURES_DIR = '__tests__/fixtures/hulu/titles'
const CONCURRENCY = 10

const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'))

// imageUrl が空のものだけ対象
const targets: { filePath: string; slug: string }[] = []
for (const file of files) {
  const filePath = resolve(FIXTURES_DIR, file)
  const data = JSON.parse(readFileSync(filePath, 'utf-8'))
  const hasValidImageUrl = typeof data.imageUrl === 'string' && data.imageUrl.startsWith('http')
  if (!hasValidImageUrl) {
    targets.push({ filePath, slug: basename(file, '.json') })
  }
}

console.log(`Total: ${files.length}, Need imageUrl: ${targets.length}`)

let success = 0
let failed = 0

for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY)
  await Promise.all(
    batch.map(async ({ filePath, slug }) => {
      try {
        const meta = await fetchSeriesMeta(slug)
        const data = JSON.parse(readFileSync(filePath, 'utf-8'))
        data.imageUrl = meta.imageUrl
        await Bun.write(filePath, JSON.stringify(data, null, 2) + '\n')
        success++
      } catch {
        failed++
      }
    })
  )
  const done = Math.min(i + CONCURRENCY, targets.length)
  if (done % 100 === 0 || done === targets.length) {
    process.stdout.write(`\r[${done}/${targets.length}] success: ${success}, failed: ${failed}`)
  }
}

console.log(`\nDone! success: ${success}, failed: ${failed}`)
