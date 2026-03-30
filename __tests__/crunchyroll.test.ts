import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { browseItemToTitle } from '../src/lib/providers/crunchyroll/browse'
import { TitleSchema } from '../src/schemas/providers/common.dto'
import {
  BrowseResponseSchema,
  EpisodesResponseSchema,
  SeasonsResponseSchema,
  SeriesDetailResponseSchema
} from '../src/schemas/providers/crunchyroll.dto'

const fixturesDir = resolve(__dirname, 'fixtures/crunchyroll')
const readFixture = (name: string) => JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))

describe('BrowseResponseSchema', () => {
  test('browse-new.json をパースできる', () => {
    const raw = readFixture('browse-new.json')
    const parsed = BrowseResponseSchema.parse(raw)
    expect(parsed.total).toBeGreaterThan(0)
    expect(parsed.data.length).toBeGreaterThan(100)

    for (const item of parsed.data) {
      expect(item.id).toBeTruthy()
      expect(item.title).toBeTruthy()
      expect(item.slug_title).toBeTruthy()
    }
  }, 30_000)

  test('browse-all.json をパースできる', () => {
    const raw = readFixture('browse-all.json')
    const parsed = BrowseResponseSchema.parse(raw)
    expect(parsed.total).toBeGreaterThan(0)
    expect(parsed.data.length).toBeGreaterThan(100)
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

describe('SeriesDetailResponseSchema', () => {
  test('series-GRMG8ZQZR.json をパースできる', () => {
    const raw = readFixture('series-GRMG8ZQZR.json')
    const parsed = SeriesDetailResponseSchema.parse(raw)
    expect(parsed.data.length).toBe(1)
    expect(parsed.data[0].title).toBeTruthy()
    expect(parsed.data[0].id).toBe('GRMG8ZQZR')
  })
})

describe('SeasonsResponseSchema', () => {
  test('seasons-GRMG8ZQZR.json をパースできる', () => {
    const raw = readFixture('seasons-GRMG8ZQZR.json')
    const parsed = SeasonsResponseSchema.parse(raw)
    expect(parsed.total).toBeGreaterThan(0)
    expect(parsed.data.length).toBeGreaterThan(0)

    for (const season of parsed.data) {
      expect(season.id).toBeTruthy()
      expect(season.series_id).toBe('GRMG8ZQZR')
      expect(season.season_number).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('EpisodesResponseSchema', () => {
  test('episodes-GY3VWX3MR.json をパースできる', () => {
    const raw = readFixture('episodes-GY3VWX3MR.json')
    const parsed = EpisodesResponseSchema.parse(raw)
    expect(parsed.total).toBeGreaterThan(0)
    expect(parsed.data.length).toBeGreaterThan(0)

    for (const ep of parsed.data) {
      expect(ep.id).toBeTruthy()
      expect(ep.title).toBeTruthy()
    }
  })
})
