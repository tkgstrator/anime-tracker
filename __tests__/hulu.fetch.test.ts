import { describe, expect, test } from 'bun:test'
import { HuluProvider } from '../src/lib/providers/hulu'
import { TitleInfoSchema } from '../src/schemas/providers/common.dto'

describe('Hulu fetch', () => {
  const provider = new HuluProvider()

  test('fetchTitleList でアニメ一覧が取得できる', async () => {
    const titles = await provider.fetchTitleList()
    expect(titles.length).toBeGreaterThan(0)

    for (const t of titles.slice(0, 5)) {
      expect(t.contentId).toBeTruthy()
      expect(t.title).toBeTruthy()
      expect(t.entityType).toBeTruthy()
    }
  }, 60_000)

  test('fetchEpisodeList で詳細が取得できる', async () => {
    const detail = TitleInfoSchema.parse(await provider.fetchEpisodeList('spy-family'))

    expect(detail.title).toBeTruthy()
    expect(detail.seasons.length).toBeGreaterThan(0)
    for (const season of detail.seasons) {
      expect(season.episodes.length).toBeGreaterThan(0)
    }
  }, 30_000)
})
