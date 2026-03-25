import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import type { VodItem } from '../../../schemas/providers/hulu.dto'
import { type FetchTitleListOptions, Provider } from '../base'
import { DECADE_AG, fetchHuluAnimeByDecade, fetchRecentlyAdded } from './browse'

import { fetchHuluTitleDetail } from './detail'

function vodItemToTitle(item: VodItem): Title {
  return {
    contentId: item.slug,
    title: item.title,
    description: item.description,
    entityType: item.schema_key === 'series' ? 'tv' : 'movie',
    imageUrl: item.imageUrl,
    maturityRating: null,
    benefitId: 'hulu'
  }
}

/**
 * Hulu プロバイダ。
 *
 * Hulu の Palette API / Filtered API からアニメタイトル一覧を取得し、
 * エピソードページの RSC ペイロードからエピソード情報を取得する。
 */
export class HuluProvider extends Provider {
  readonly name = 'hulu'

  /**
   * Hulu のアニメタイトル一覧を取得する。
   *
   * newEpisodesOnly: true の場合は `recentlyadded-anime` パレット API から直接取得。
   * それ以外は全年代 (2000s/2010s/2020s) の Filtered API から一括取得する。
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    if (options?.newEpisodesOnly) {
      const items = await fetchRecentlyAdded()
      const seen = new Set<string>()
      const titles: Title[] = []
      for (const item of items) {
        const slug = item.additionalInfo.slug ?? item.slug
        if (seen.has(slug)) continue
        seen.add(slug)
        titles.push(vodItemToTitle({ ...item, slug }))
      }
      return titles
    }

    const decades = Object.keys(DECADE_AG).map(Number)
    const results = await Promise.all(decades.map((decade) => fetchHuluAnimeByDecade(decade)))
    const seen = new Set<string>()
    const titles: Title[] = []
    for (const item of results.flat()) {
      if (seen.has(item.slug)) continue
      seen.add(item.slug)
      titles.push(vodItemToTitle(item))
    }
    return titles
  }

  /**
   * コンテンツ ID (slug) からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * RSC ペイロードと Falcor API を並列で呼び出しマージする。
   * @param contentId - Hulu のスラッグ (例: "dandadan")
   * @returns タイトル詳細情報
   */
  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    return fetchHuluTitleDetail(contentId)
  }
}
