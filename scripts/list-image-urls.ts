/**
 * fixtures から全画像 URL を収集し、TSV（imageUrl\tR2キー）で出力する。
 * 使い方: bun run scripts/list-image-urls.ts > scripts/image-list.tsv
 */
import { readFileSync } from 'node:fs'
import { imageKey } from '../src/lib/image-key'

const seen = new Set<string>()
const glob = new Bun.Glob('**/*.json')

const dirs = [
  '__tests__/fixtures/amazon/titles',
  '__tests__/fixtures/hulu/titles',
  '__tests__/fixtures/amazon/episodes_refetched',
  '__tests__/fixtures/hulu/episodes_refetched',
  '__tests__/fixtures/crunchyroll/episodes_refetched'
]

for (const dir of dirs) {
  for (const path of glob.scanSync(dir)) {
    const data = JSON.parse(readFileSync(`${dir}/${path}`, 'utf-8'))
    for (const url of collectUrls(data)) {
      const key = imageKey(url)
      if (!seen.has(key)) {
        seen.add(key)
        console.log(`${url}\t${key}`)
      }
    }
  }
}

function collectUrls(data: any): string[] {
  const urls: string[] = []
  if (data.imageUrl) urls.push(data.imageUrl)
  for (const s of data.seasons ?? []) {
    if (s.imageUrl) urls.push(s.imageUrl)
    for (const e of s.episodes ?? []) {
      if (e.imageUrl) urls.push(e.imageUrl)
    }
  }
  return urls
}
