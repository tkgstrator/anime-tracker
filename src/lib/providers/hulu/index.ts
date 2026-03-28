import dayjs from 'dayjs'
import type { BadgeType, Title, TitleInfo } from '../../../schemas/providers/common.dto'
import type { VodItem } from '../../../schemas/providers/hulu.dto'
import { getAppLogger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { fetchCurrentSeasonAnime, fetchHuluAnimeAll, fetchHuluExpiring, fetchRecentlyAdded } from './browse'

import { fetchHuluTitleDetail, parseHuluDate } from './detail'

const logger = getAppLogger('hulu')

/**
 * coming_soon_text (例: "4月13日 配信開始") から配信開始日を ISO 文字列で返す。
 * パースできなければ null。
 */
function parseComingSoonDate(text: string): string | null {
  const m = text.match(/(\d+)月(\d+)日/)
  if (!m) return null
  const now = dayjs()
  const month = Number(m[1])
  const day = Number(m[2])
  // 年をまたぐケース: 現在12月で month が 1〜3 なら翌年
  const year = month < now.month() + 1 - 6 ? now.year() + 1 : now.year()
  return dayjs(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`).toISOString()
}

function vodItemToTitle(item: VodItem, badge?: BadgeType | null, comingSoonDate?: string | null): Title {
  const badgeEndAt = item.additionalInfo.card_info.badge_text_end_at
  return {
    contentId: item.slug,
    title: item.title,
    description: item.description,
    entityType: item.schema_key === 'series' ? 'tv' : 'movie',
    imageUrl: item.imageUrl,
    maturityRating: null,
    benefitId: 'hulu',
    nextEpisodeDate: comingSoonDate ?? (badgeEndAt ? parseHuluDate(badgeEndAt) : null),
    badge: badge ?? null
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
   * - `new_episode`: Palette API (recentlyadded-anime + seasonal)
   *   → asset があるシリーズは NEW_EPISODE、それ以外は RECENTLY_ADDED
   * - `coming_soon`: Palette API → COMING_SOON のみ
   * - `expiring`: Filtered API (publish_end_at 昇順) で配信終了間近のタイトル
   * - 未指定: Filtered API (g:8) で全アニメ (TV + 映画)
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const category = options?.category

    if (category === 'new_episode' || category === 'coming_soon') {
      return this.fetchNewAndRecent(category)
    }
    if (category === 'expiring') {
      return this.fetchExpiring()
    }
    return this.fetchAll()
  }

  /**
   * 新着エピソード / 最近更新: Palette API (recentlyadded-anime + seasonal)
   *
   * Palette にはエピソード単体 (asset) とシリーズ (series) が混在する。
   * - あるシリーズの asset が含まれている → NEW_EPISODE (新エピソード追加)
   * - series だけで asset がない → RECENTLY_ADDED (シリーズ自体が最近追加)
   *
   * category で返すバッジをフィルタする。
   */
  private async fetchNewAndRecent(category: 'new_episode' | 'coming_soon'): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: category })
    const [recentItems, seasonItems] = await Promise.all([fetchRecentlyAdded(), fetchCurrentSeasonAnime()])
    logger.debug({
      action: 'fetched-sources',
      recentCount: recentItems.length,
      seasonCount: seasonItems.length
    })

    // recentlyadded-anime の asset から、エピソード追加があるシリーズの series_id を集める
    const seriesWithAsset = new Set<number>()
    for (const item of recentItems) {
      if (item.additionalInfo.schema_key === 'asset' && item.additionalInfo.series_id) {
        seriesWithAsset.add(item.additionalInfo.series_id)
      }
    }

    const targetBadges: Set<BadgeType> =
      category === 'new_episode'
        ? new Set(['NEW_EPISODE', 'RECENTLY_ADDED'])
        : category === 'coming_soon'
          ? new Set(['COMING_SOON'])
          : new Set(['RECENTLY_ADDED'])
    const allItems = [...recentItems, ...seasonItems]
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const item of allItems) {
      if (item.additionalInfo.schema_key !== 'series') continue
      if (seen.has(item.slug)) continue
      seen.add(item.slug)

      const comingSoonText = item.additionalInfo.card_info.coming_soon_text
      const badge: BadgeType = comingSoonText
        ? 'COMING_SOON'
        : seriesWithAsset.has(item.id_in_schema)
          ? 'NEW_EPISODE'
          : 'RECENTLY_ADDED'
      if (!targetBadges.has(badge)) continue

      const comingSoonDate = comingSoonText ? parseComingSoonDate(comingSoonText) : null
      titles.push(vodItemToTitle(item, badge, comingSoonDate))
    }

    logger.info({ action: 'fetch-title-list-done', mode: category, count: titles.length })
    return titles
  }

  /** 配信終了間近: Filtered API (publish_end_at 昇順、30日以内) */
  private async fetchExpiring(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'expiring' })
    const items = await fetchHuluExpiring()
    logger.debug({ action: 'fetched-expiring', count: items.length })
    const seen = new Set<string>()
    const titles: Title[] = []
    for (const item of items) {
      if (seen.has(item.slug)) continue
      seen.add(item.slug)
      const title = vodItemToTitle(item)
      if (item.endAt) {
        title.expiring = {
          remainingHours: Math.max(1, Math.ceil(dayjs(item.endAt.replace(/\//g, '-')).diff(dayjs(), 'hour'))),
          season: null
        }
      }
      titles.push(title)
    }
    logger.info({ action: 'fetch-title-list-done', mode: 'expiring', count: titles.length })
    return titles
  }

  /** 全タイトル: Filtered API (g:8, TV + 映画) */
  private async fetchAll(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'all' })
    const results = await fetchHuluAnimeAll()
    logger.debug({ action: 'fetched-all', count: results.length })
    const seen = new Set<string>()
    const titles: Title[] = []
    for (const item of results) {
      if (seen.has(item.slug)) continue
      seen.add(item.slug)
      titles.push(vodItemToTitle(item))
    }
    logger.info({ action: 'fetch-title-list-done', mode: 'all', count: titles.length })
    return titles
  }

  /**
   * コンテンツ ID (slug) からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * RSC ペイロードと Falcor API を並列で呼び出しマージする。
   * @param contentId - Hulu のスラッグ (例: "dandadan")
   * @returns タイトル詳細情報
   */
  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchHuluTitleDetail(contentId)
    logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
