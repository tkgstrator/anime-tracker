import type { Title, TitleDetail } from '../../../schemas/provider.dto'
import { type FetchTitleListOptions, Provider } from '../base'
import { DECADE_AG, fetchHuluAnimeByDecade, fetchRecentlyAddedIds } from './browse'

import { fetchHuluTitleDetail } from './detail'

/**
 * Hulu プロバイダ。
 *
 * Hulu の Palette API / Filtered API からアニメタイトル一覧を取得し、
 * エピソードページの RSC ペイロードからエピソード情報を取得する。
 */
export class HuluProvider extends Provider {
  readonly name = 'hulu'

  /**
   * Hulu の全年代のアニメタイトル一覧を取得する。
   *
   * 2000年代・2010年代・2020年代の3つの年代から一括取得し、
   * 重複を除去して返す。
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const decades = options?.newEpisodesOnly ? [2020] : Object.keys(DECADE_AG).map(Number)
    const [results, recentIds] = await Promise.all([
      Promise.all(decades.map((decade) => fetchHuluAnimeByDecade(decade))),
      options?.newEpisodesOnly ? fetchRecentlyAddedIds() : Promise.resolve(null)
    ])
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const item of results.flat()) {
      if (seen.has(item.slug)) continue
      if (recentIds && !recentIds.has(item.additionalInfo.id_in_schema)) continue
      seen.add(item.slug)
      titles.push({
        contentId: item.slug,
        title: item.title,
        description: item.description,
        entityType: item.schema_key === 'series' ? 'tv' : 'movie',
        imageUrl: item.imageUrl,
        maturityRating: null
      })
    }
    return titles
  }

  /**
   * コンテンツ ID (slug) からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * @param contentId - Hulu のスラッグ (例: "dandadan")
   * @returns タイトル詳細情報
   */
  async fetchEpisodeList(contentId: string): Promise<TitleDetail> {
    return fetchHuluTitleDetail(contentId)
  }
}

export { buildSlug, fetchHuluAnime, fetchHuluAnimeByDecade, fetchRecentlyAddedIds } from './browse'
export { extractEpisodesFromRsc, fetchHuluTitleDetail } from './detail'
