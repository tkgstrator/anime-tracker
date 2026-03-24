import { describe, expect, test } from 'bun:test'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { extractPageData } from '../src/lib/providers/amazon/detail'
import { TitleInfoSchema } from '../src/schemas/provider.dto'
import { fixtureIds, titlesDir } from './fixtures/amazon/ids'

describe('extractPageData', () => {
  for (const id of fixtureIds) {
    const html = readFileSync(resolve(titlesDir, `${id}.html`), 'utf-8')
    const page = extractPageData(html)

    test(`${id}: ${page.title}`, () => {
      expect(page.title).toBeTruthy()
      expect(page.synopsis).toBeTruthy()
      expect(page.entityType).toMatch(/^(tv|movie)$/)
      if (page.entityType === 'movie') {
        expect(page.seasons).toHaveLength(0)
        expect(page.episodePageTokens).toHaveLength(0)
      } else {
        for (const s of page.seasons) {
          expect(s.seasonId).toBeTruthy()
          expect(s.displayName).toBeTruthy()
          expect(s.seasonNumber).toBeGreaterThan(0)
        }
        expect(page.episodePageTokens.length).toBeGreaterThan(0)
      }
    })
  }
})

describe('エピソードデータ', () => {
  for (const id of fixtureIds) {
    const jsonPath = resolve(titlesDir, `${id}.json`)
    if (!existsSync(jsonPath)) continue
    const fixture = TitleInfoSchema.parse(JSON.parse(readFileSync(jsonPath, 'utf-8')))

    test(`${id}: ${fixture.title} — ${fixture.seasons.length} シーズン`, () => {
      expect(fixture.title).toBeTruthy()
      expect(fixture.entityType).toMatch(/^(tv|movie)$/)
      expect(fixture.seasons.length).toBeGreaterThan(0)

      for (const season of fixture.seasons) {
        expect(season.seasonId).toBeTruthy()
        expect(season.displayName).toBeTruthy()
        expect(season.seasonNumber).toBeGreaterThan(0)
        expect(season.episodes.length).toBeGreaterThan(0)

        for (const ep of season.episodes) {
          expect(ep.episodeNumber).toBeGreaterThan(0)
          expect(ep.episodeId).toBeTruthy()
          expect(ep.title).toBeTruthy()
          expect(ep.description).toBeTruthy()
          expect(ep.duration).toBeGreaterThan(0)
          expect(ep.imageUrl).toBeTruthy()
          expect(typeof ep.hasSubtitles).toBe('boolean')
          expect(typeof ep.hasDub).toBe('boolean')
        }
      }
    })

    test(`${id}: エピソード番号が連続している`, () => {
      for (const season of fixture.seasons) {
        const numbers = season.episodes.map((ep) => ep.episodeNumber)
        const sorted = [...numbers].sort((a, b) => a - b)
        expect(numbers).toEqual(sorted)
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBe(sorted[i - 1] + 1)
        }
      }
    })
  }
})
