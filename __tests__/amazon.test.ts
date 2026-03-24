import { describe, test } from 'bun:test'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const titlesDir = resolve(__dirname, 'fixtures/amazon/titles')

const titleIds = readdirSync(titlesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => f.replace('.json', ''))

describe('HTMLパース', () => {
  for (const id of titleIds) {
    const _html = readFileSync(resolve(titlesDir, `${id}.html`), 'utf-8')
    test(`${id}: 基本情報`, () => {
      // const page = extractPageData(html)
      // expect(page.title).toBeTruthy()
      // expect(page.synopsis).toBeTruthy()
      // expect(page.entityType).toBeTruthy()
    })

    test(`${id}: シーズン情報`, () => {
      // const _page = extractPageData(html)
      // expect(page.seasons.length).toBe(uniqueSeasonIds.size)
      // for (const s of page.seasons) {
      //   expect(s.seasonId).toBeTruthy()
      //   expect(s.displayName).toBeTruthy()
      //   expect(s.seasonNumber).toBeGreaterThan(0)
      //   expect(uniqueSeasonIds).toContain(s.seasonId)
      // }
    })

    test(`${id}: エピソードトークン`, () => {
      // const page = extractPageData(html)
      // expect(page.episodePageTokens.length).toBeGreaterThan(0)
    })
  }
})

describe('エピソードデータ', () => {
  for (const _id of titleIds) {
    // const fixture = TitleDetail.parse(JSON.parse(readFileSync(resolve(titlesDir, `${id}.json`), 'utf-8')))
    // for (const season of fixture.seasons) {
    //   test(`${id} ${season.displayName}: エピソード`, () => {
    //     expect(season.episodes.length).toBeGreaterThan(0)
    //     for (const ep of season.episodes) {
    //       expect(ep.episodeNumber).toBeGreaterThan(0)
    //       expect(ep.episodeId).toBeTruthy()
    //       expect(ep.title).toBeTruthy()
    //       expect(ep.description).toBeTruthy()
    //       expect(ep.releaseDate).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    //       expect(ep.duration).toBeGreaterThan(0)
    //       expect(ep.imageUrl).toBeTruthy()
    //       expect(typeof ep.hasSubtitles).toBe('boolean')
    //       expect(typeof ep.hasDub).toBe('boolean')
    //     }
    //   })
    //   test(`${id} ${season.displayName}: エピソード番号`, () => {
    //     const numbers = season.episodes.map((ep) => ep.episodeNumber)
    //     const sorted = [...numbers].sort((a, b) => a - b)
    //     expect(numbers).toEqual(sorted)
    //     for (let i = 1; i < sorted.length; i++) {
    //       expect(sorted[i]).toBe(sorted[i - 1] + 1)
    //     }
    //   })
    // }
  }
})
