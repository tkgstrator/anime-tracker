import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractPageData } from '../../../src/lib/providers/amazon/detail'
import { TitleInfoSchema } from '../../../src/schemas/providers/common.dto'

const fixturesDir = resolve(__dirname, '../../fixtures/amazon')
const readFixture = (name: string) => readFileSync(resolve(fixturesDir, name), 'utf-8')

const testTitles = [
  { contentId: 'B0CHBQ53NP', label: '葬送のフリーレン' },
  { contentId: 'B0CH5FZ9MV', label: '薬屋のひとりごと' }
]

describe('extractPageData', () => {
  for (const { contentId, label } of testTitles) {
    const html = readFixture(`${contentId}.html`)
    const expected = TitleInfoSchema.parse(JSON.parse(readFixture(`${contentId}.json`)))
    const page = extractPageData(html)

    test(`${label}: タイトル・説明`, () => {
      expect(page.title).toBe(expected.title)
      expect(page.synopsis).toBe(expected.description)
      expect(page.entityType).toBe(expected.entityType)
    })

    test(`${label}: シーズン情報`, () => {
      expect(page.seasons.length).toBe(expected.seasons.length)
      for (let i = 0; i < expected.seasons.length; i++) {
        expect(page.seasons[i].seasonId).toBe(expected.seasons[i].seasonId)
        expect(page.seasons[i].displayName).toBe(expected.seasons[i].displayName)
        expect(page.seasons[i].seasonNumber).toBe(expected.seasons[i].seasonNumber)
      }
    })

    test(`${label}: episodePageTokens が存在する`, () => {
      expect(page.episodePageTokens.length).toBeGreaterThan(0)
    })
  }
})
