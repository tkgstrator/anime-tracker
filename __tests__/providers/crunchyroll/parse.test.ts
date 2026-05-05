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
    const result = BrowseResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.total).toBeGreaterThan(0)
    expect(result.data.data.length).toBeGreaterThan(0)

    for (const item of result.data.data) {
      expect(item.id).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.slug_title).toBeTruthy()
    }
  }, 30_000)

  test('BrowseItem → Title 変換が TitleSchema を満たす', () => {
    const raw = readFixture('browse-new.json')
    const result = BrowseResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    for (const item of result.data.data) {
      const title = browseItemToTitle(item)
      const r = TitleSchema.safeParse(title)
      expect(r.success).toBe(true)
    }
  }, 30_000)

  test('extended_maturity_rating が空オブジェクトでもパースできる', () => {
    const raw = readFixture('browse-new.json')
    const emptyEmr = raw.data.find(
      (i: Record<string, unknown>) =>
        i.series_metadata &&
        (i.series_metadata as Record<string, unknown>).extended_maturity_rating !== undefined &&
        Object.keys((i.series_metadata as Record<string, unknown>).extended_maturity_rating as object).length === 0
    )
    expect(emptyEmr).toBeTruthy()
    const result = BrowseResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
  })
})

const seriesFixtures = [
  { id: 'GG5H5XQX4', label: '葬送のフリーレン', seasonIds: ['GYE5CQMQ5', 'G6X0C4JDV'] },
  { id: 'G3KHEVDJ7', label: '薬屋のひとりごと', seasonIds: ['GR09CXPEK', 'G63VC291N'] }
]

describe('SeriesDetailResponseSchema', () => {
  for (const { id, label } of seriesFixtures) {
    test(`${label} (${id})`, () => {
      const result = SeriesDetailResponseSchema.safeParse(readFixture(`series-${id}.json`))
      expect(result.success).toBe(true)
      if (!result.success) return
      const expected = TitleInfoSchema.parse(readFixture(`${id}.json`))

      expect(result.data.data.length).toBe(1)
      expect(result.data.data[0].id).toBe(id)
      expect(result.data.data[0].title).toBe(expected.title)
    })
  }
})

describe('SeasonsResponseSchema', () => {
  for (const { id, label } of seriesFixtures) {
    test(`${label} (${id})`, () => {
      const result = SeasonsResponseSchema.safeParse(readFixture(`seasons-${id}.json`))
      expect(result.success).toBe(true)
      if (!result.success) return
      const expected = TitleInfoSchema.parse(readFixture(`${id}.json`))

      expect(result.data.data.length).toBeGreaterThanOrEqual(expected.seasons.length)

      for (const season of result.data.data) {
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
        const result = EpisodesResponseSchema.safeParse(readFixture(`episodes-${seasonId}.json`))
        expect(result.success).toBe(true)
        if (!result.success) return

        expect(result.data.data.length).toBe(expectedSeason.episodes.length)
        for (let j = 0; j < expectedSeason.episodes.length; j++) {
          expect(result.data.data[j].id).toBe(expectedSeason.episodes[j].episodeId)
          expect(result.data.data[j].title).toBe(expectedSeason.episodes[j].title)
        }
      })
    }
  }
})
