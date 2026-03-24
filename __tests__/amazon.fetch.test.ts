import { describe, expect, test } from 'bun:test'
import { AmazonProvider } from '../src/lib/providers/amazon'
import { TitleInfoSchema } from '../src/schemas/provider.dto'

describe('Amazon fetch', () => {
  const provider = new AmazonProvider()

  test('fetchTitleList でアニメ一覧が取得できる', async () => {
    const titles = await provider.fetchTitleList()
    expect(titles.length).toBeGreaterThan(0)

    for (const t of titles.slice(0, 5)) {
      expect(t.contentId).toBeTruthy()
      expect(t.title).toBeTruthy()
      expect(t.entityType).toBeTruthy()
    }
  }, 30_000)

  test('fetchEpisodeList で詳細が取得できる', async () => {
    const titleId = 'B0CJRDF9JB' // 葬送のフリーレン
    const detail = TitleInfoSchema.parse(await provider.fetchEpisodeList(titleId))

    expect(detail.title).toBeTruthy()
    expect(detail.seasons.length).toBeGreaterThan(0)
    for (const season of detail.seasons) {
      expect(season.episodes.length).toBeGreaterThan(0)
    }
  }, 60_000)
})
