import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { browseItemToTitle } from '../../../src/lib/providers/crunchyroll/browse'
import { TitleInfoSchema, TitleSchema } from '../../../src/schemas/providers/common.dto'
import {
  BrowseResponseSchema,
  EpisodesResponseSchema,
  SeasonsResponseSchema,
  SeriesDetailResponseSchema
} from '../../../src/schemas/providers/crunchyroll.dto'

const fixturesDir = resolve(__dirname, '../../fixtures/crunchyroll')
const readFixture = (name: string) => JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))

describe('BrowseResponseSchema', () => {
  test('browse-new.json をパースできる', () => {
    const raw = readFixture('browse-new.json')
    const parsed = BrowseResponseSchema.parse(raw)
    expect(parsed.total).toBeGreaterThan(0)
    expect(parsed.data.length).toBeGreaterThan(0)

    for (const item of parsed.data) {
      expect(item.id).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.slug_title).toBeTruthy()
    }
  }, 30_000)

  test('BrowseItem → Title 変換が TitleSchema を満たす', () => {
    const raw = readFixture('browse-new.json')
    const parsed = BrowseResponseSchema.parse(raw)
    for (const item of parsed.data) {
      const title = browseItemToTitle(item)
      TitleSchema.parse(title)
    }
  }, 30_000)
})

const seriesFixtures = [
  { id: 'GG5H5XQX4', label: '葬送のフリーレン', seasonIds: ['GYE5CQMQ5', 'G6X0C4JDV'] },
  { id: 'G3KHEVDJ7', label: '薬屋のひとりごと', seasonIds: ['GR09CXPEK', 'G63VC291N'] }
]

describe('SeriesDetailResponseSchema', () => {
  for (const { id, label } of seriesFixtures) {
    test(`${label} (${id})`, () => {
      const parsed = SeriesDetailResponseSchema.parse(readFixture(`series-${id}.json`))
      const expected = TitleInfoSchema.parse(readFixture(`${id}.json`))

      expect(parsed.data.length).toBe(1)
      expect(parsed.data[0].id).toBe(id)
      expect(parsed.data[0].title).toBe(expected.title)
    })
  }
})

describe('SeasonsResponseSchema', () => {
  for (const { id, label } of seriesFixtures) {
    test(`${label} (${id})`, () => {
      const parsed = SeasonsResponseSchema.parse(readFixture(`seasons-${id}.json`))
      const expected = TitleInfoSchema.parse(readFixture(`${id}.json`))

      expect(parsed.data.length).toBeGreaterThanOrEqual(expected.seasons.length)

      for (const season of parsed.data) {
        expect(season.id).toBeTruthy()
        expect(season.series_id).toBe(id)
      }
    })
  }
})

describe('EpisodesResponseSchema', () => {
  for (const { id, label, seasonIds } of seriesFixtures) {
    const expected = TitleInfoSchema.parse(readFixture(`${id}.json`))

    for (let i = 0; i < seasonIds.length; i++) {
      const seasonId = seasonIds[i]
      const expectedSeason = expected.seasons[i]

      test(`${label} ${expectedSeason.displayName} (${seasonId})`, () => {
        const parsed = EpisodesResponseSchema.parse(readFixture(`episodes-${seasonId}.json`))

        expect(parsed.data.length).toBe(expectedSeason.episodes.length)
        for (let j = 0; j < expectedSeason.episodes.length; j++) {
          expect(parsed.data[j].id).toBe(expectedSeason.episodes[j].episodeId)
          expect(parsed.data[j].title).toBe(expectedSeason.episodes[j].title)
        }
      })
    }
  }
})
