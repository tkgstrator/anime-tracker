import { describe, expect, test } from 'bun:test'
import { AmazonProvider } from '../src/lib/providers/amazon'
import { TitleInfoSchema } from '../src/schemas/providers/common.dto'
import { fixtureIds } from './fixtures/amazon/ids'

describe('fetchTitleList', () => {
  const provider = new AmazonProvider()

  test('01', async () => {
    const titles = await provider.fetchTitleList()
    expect(titles.length).toBeGreaterThan(0)

    for (const t of titles.slice(0, 5)) {
      expect(t.contentId).toBeTruthy()
      expect(t.title).toBeTruthy()
      expect(t.entityType).toBeTruthy()
    }
  }, 10_000)
})

describe('fetchEpisodeList', () => {
  const provider = new AmazonProvider()
  for (const id of fixtureIds) {
    test(id, async () => {
      const detail = TitleInfoSchema.parse(await provider.fetchEpisodeList(id))

      expect(detail.title).toBeTruthy()
      if (detail.entityType === 'movie') {
        expect(detail.seasons).toEqual([])
      } else {
        expect(detail.seasons.length).toBeGreaterThan(0)
        for (const season of detail.seasons) {
          expect(season.episodes.length).toBeGreaterThan(0)
        }
      }
    }, 60_000)
  }
})
