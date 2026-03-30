import { describe, expect, test } from 'bun:test'
import { CrunchyrollProvider } from '../src/lib/providers/crunchyroll'
import { TitleInfoSchema, TitleSchema } from '../src/schemas/providers/common.dto'

const provider = new CrunchyrollProvider()

describe('fetchTitleList', () => {
  test('new_episode でタイトル一覧が取得できる', async () => {
    const titles = await provider.fetchTitleList({ category: 'new_episode' })
    expect(titles.length).toBeGreaterThan(0)

    for (const t of titles.slice(0, 10)) {
      TitleSchema.parse(t)
      expect(t.badge).toMatch(/^(NEW_EPISODE|RECENTLY_ADDED)$/)
    }
  }, 30_000)

  test('coming_soon は空配列を返す', async () => {
    const titles = await provider.fetchTitleList({ category: 'coming_soon' })
    expect(titles).toEqual([])
  })

  test('expiring は空配列を返す', async () => {
    const titles = await provider.fetchTitleList({ category: 'expiring' })
    expect(titles).toEqual([])
  })
})

describe('fetchTitleInfo', () => {
  // ONE PIECE — シーズン・エピソード数が多く安定しているタイトル
  test('GRMG8ZQZR (ONE PIECE)', async () => {
    const detail = TitleInfoSchema.parse(await provider.fetchTitleInfo('GRMG8ZQZR'))

    expect(detail.title).toBeTruthy()
    expect(detail.seasons.length).toBeGreaterThan(0)
    for (const season of detail.seasons) {
      expect(season.episodes.length).toBeGreaterThan(0)
      for (const ep of season.episodes.slice(0, 3)) {
        expect(ep.episodeId).toBeTruthy()
        expect(ep.duration).toBeGreaterThan(0)
      }
    }
  }, 60_000)
})
