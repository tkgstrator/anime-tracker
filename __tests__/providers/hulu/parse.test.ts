import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildSlug } from '../../../src/lib/providers/hulu/browse'
import { parseEpisodesFromHtml } from '../../../src/lib/providers/hulu/detail'
import { TitleInfoSchema } from '../../../src/schemas/providers/common.dto'

const fixturesDir = resolve(__dirname, '../../fixtures/hulu')
const readFixture = (name: string) => readFileSync(resolve(fixturesDir, name), 'utf-8')

const testTitles = [
  { contentId: 'frieren-beyond-journeys-end', label: '葬送のフリーレン' },
  { contentId: 'frieren-beyond-journeys-end-season2', label: '葬送のフリーレン 第2期' },
  { contentId: 'the-apothecary-diaries', label: '薬屋のひとりごと' },
  { contentId: 'the-apothecary-diaries-season-2', label: '薬屋のひとりごと 第2期' }
]

describe('parseEpisodesFromHtml', () => {
  for (const { contentId, label } of testTitles) {
    const html = readFixture(`${contentId}.html`)
    const expected = TitleInfoSchema.parse(JSON.parse(readFixture(`${contentId}.json`)))
    const episodes = parseEpisodesFromHtml(html)
    const expectedEpisodeCount = expected.seasons.reduce((sum, s) => sum + s.episodes.length, 0)

    test(`${label}: エピソード数が一致する`, () => {
      expect(episodes.length).toBe(expectedEpisodeCount)
    })

    test(`${label}: 各エピソードのID・タイトルが一致する`, () => {
      const expectedEpisodes = expected.seasons.flatMap((s) => s.episodes)
      for (let i = 0; i < expectedEpisodes.length; i++) {
        expect(String(episodes[i].id_in_schema)).toBe(expectedEpisodes[i].episodeId)
        expect(episodes[i].additionalInfo.short_name ?? episodes[i].title).toBe(expectedEpisodes[i].title)
      }
    })
  }
})

describe('buildSlug', () => {
  test('winter', () => {
    expect(buildSlug('winter', 2026)).toBe('january-march-quarter-anime26')
  })

  test('spring', () => {
    expect(buildSlug('spring', 2025)).toBe('april-june-quarter-anime25')
  })

  test('summer', () => {
    expect(buildSlug('summer', 2025)).toBe('july-september-quarter-anime25')
  })

  test('autumn', () => {
    expect(buildSlug('autumn', 2025)).toBe('october-december-quarter-anime25')
  })
})
