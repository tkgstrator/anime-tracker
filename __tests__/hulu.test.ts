import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { buildSlug } from '../src/lib/providers/hulu/browse'
import { parseEpisodesFromHtml } from '../src/lib/providers/hulu/detail'
import { TitleInfoSchema } from '../src/schemas/providers/common.dto'

const titlesDir = resolve(__dirname, 'fixtures/hulu/titles')

const slugs = readdirSync(titlesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))

describe('RSCパース', () => {
  for (const slug of slugs) {
    const html = readFileSync(resolve(titlesDir, `${slug}.html`), 'utf-8')

    test(`${slug}: エピソードが抽出できる`, () => {
      const episodes = parseEpisodesFromHtml(html)
      expect(episodes.length).toBeGreaterThan(0)
    })

    test(`${slug}: 各エピソードに必須フィールドがある`, () => {
      const episodes = parseEpisodesFromHtml(html)
      for (const ep of episodes) {
        expect(ep.id).toBeGreaterThan(0)
        expect(ep.title).toBeTruthy()
        expect(ep.description).toBeDefined()
        expect(ep.imageUrl).toBeTruthy()
        expect(ep.additionalInfo.episode_runtime).toBeGreaterThan(0)
      }
    })
  }
})

describe('エピソードデータ', () => {
  for (const slug of slugs) {
    const fixture = TitleInfoSchema.parse(JSON.parse(readFileSync(resolve(titlesDir, `${slug}.json`), 'utf-8')))

    for (const season of fixture.seasons) {
      test(`${slug} ${season.displayName}: エピソード ${season.episodes.length} 件が正しい`, () => {
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
      })

      test(`${slug} ${season.displayName}: エピソード番号が連続している`, () => {
        const numbers = season.episodes.map((ep) => ep.episodeNumber)
        const sorted = [...numbers].sort((a, b) => a - b)

        expect(numbers).toEqual(sorted)
        for (let i = 1; i < sorted.length; i++) {
          expect(sorted[i]).toBe(sorted[i - 1] + 1)
        }
      })
    }
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
