import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const titlesDir = resolve(__dirname, 'titles')

/** 日付ディレクトリ一覧（例: ['2025-03', '2026-03']） */
export const fixtureDirs = readdirSync(titlesDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()

/** 全ディレクトリの fixture を { dir, id, dirPath } で返す */
export const fixtures = fixtureDirs.flatMap((dir) => {
  const dirPath = resolve(titlesDir, dir)
  const ids = readdirSync(dirPath)
    .filter((f) => f.endsWith('.html'))
    .map((f) => f.replace('.html', ''))
  return ids.map((id) => ({ dir, id, dirPath }))
})

/** 後方互換: 全 fixture の contentId 一覧 */
export const fixtureIds = [...new Set(fixtures.map((f) => f.id))]
