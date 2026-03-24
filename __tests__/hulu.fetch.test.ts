import { describe, expect, test } from 'bun:test'
import { fetchHuluTitleDetail, HuluProvider } from '../src/lib/providers/hulu'
import { ProviderTitleDetail } from '../src/schemas/provider.dto'

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

  test('fetchHuluTitleDetail で詳細が取得できる', async () => {
    const detail = ProviderTitleDetail.parse(await fetchHuluTitleDetail('spy-family'))

    expect(detail.title).toBeTruthy()
    expect(detail.seasons.length).toBeGreaterThan(0)
    for (const season of detail.seasons) {
      expect(season.episodes.length).toBeGreaterThan(0)
    }
  }, 30_000)
})
