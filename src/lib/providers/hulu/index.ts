import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import type { VodItem } from '../../../schemas/providers/hulu.dto'
import { type FetchTitleListOptions, Provider } from '../base'
import { DECADE_AG, fetchCurrentSeasonAnime, fetchHuluAnimeByDecade, fetchRecentlyAdded } from './browse'

import { fetchHuluTitleDetail, parseHuluDate } from './detail'

function vodItemToTitle(item: VodItem): Title {
  const badgeEndAt = item.additionalInfo.card_info.badge_text_end_at
  return {
    contentId: item.slug,
    title: item.title,
    description: item.description,
    entityType: item.schema_key === 'series' ? 'tv' : 'movie',
    imageUrl: item.imageUrl,
    maturityRating: null,
    benefitId: 'hulu',
    nextEpisodeDate: badgeEndAt ? parseHuluDate(badgeEndAt) : null
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
      const [recentItems, seasonItems] = await Promise.all([fetchRecentlyAdded(), fetchCurrentSeasonAnime()])
      const seen = new Set<string>()
      const titles: Title[] = []
      for (const item of recentItems) {
        if (item.additionalInfo.schema_key !== 'series') continue
        if (seen.has(item.slug)) continue
        seen.add(item.slug)
        titles.push(vodItemToTitle(item))
      }
      for (const item of seasonItems) {
        if (item.additionalInfo.schema_key !== 'series') continue
        if (seen.has(item.slug)) continue
        seen.add(item.slug)
        titles.push(vodItemToTitle(item))
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
