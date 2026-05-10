import dayjs from 'dayjs'
import type { BadgeType, Title, TitleInfo } from '../../../schemas/providers/common.dto'
import type { VodItem } from '../../../schemas/providers/hulu.dto'
import { Provider } from '../base'
import {
  currentSeasonSlugs,
  fetchHuluExpiringPage,
  fetchHuluFilteredPage,
  fetchHuluPalettePage,
  fetchRecentlyAddedPage
} from './browse'
import { fetchHuluTitleDetail, parseHuluDate } from './detail'

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
    nextEpisodeDate: comingSoonDate ?? (badgeEndAt ? parseHuluDate(badgeEndAt) : undefined),
    badge: badge ?? undefined
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

  /** 共通: new_episode / coming_soon は同じソース (recentlyadded + seasonal) を読み出すので一括取得 */
  private async fetchRecentAndSeason(category: 'new_episode' | 'coming_soon'): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: category })
    const [recentItems, seasonItems] = await Promise.all([
      this.paginate<VodItem, number>({
        initial: 0,
        fetchPage: (from) => fetchRecentlyAddedPage(from)
      }),
      this.fetchSeasonItems()
    ])
    this.logger.debug({ action: 'fetched-sources', recentCount: recentItems.length, seasonCount: seasonItems.length })

    // recentlyadded-anime の asset → エピソード追加があるシリーズの series_id を抽出
    const seriesWithAsset = new Set<number>()
    for (const item of recentItems) {
      if (item.additionalInfo.schema_key === 'asset' && item.additionalInfo.series_id) {
        seriesWithAsset.add(item.additionalInfo.series_id)
      }
    }

    const targetBadges: Set<BadgeType> =
      category === 'new_episode' ? new Set(['NEW_EPISODE', 'RECENTLY_ADDED']) : new Set(['COMING_SOON'])

    const seriesOnly = [...recentItems, ...seasonItems].filter((i) => i.additionalInfo.schema_key === 'series')
    const titles = this.dedupeBy(seriesOnly, (i) => i.slug)
      .map((item) => {
        const comingSoonText = item.additionalInfo.card_info.coming_soon_text
        const badge: BadgeType = comingSoonText
          ? 'COMING_SOON'
          : seriesWithAsset.has(item.id_in_schema)
            ? 'NEW_EPISODE'
            : 'RECENTLY_ADDED'
        const comingSoonDate = comingSoonText ? parseComingSoonDate(comingSoonText) : null
        return targetBadges.has(badge) ? vodItemToTitle(item, badge, comingSoonDate) : null
      })
      .filter((t): t is Title => t !== null)

    this.logger.info({ action: 'fetch-title-list-done', mode: category, count: titles.length })
    return titles
  }

  /** 今期 (＋最終月なら来期も) のシーズン slug を Promise.all で取得して重複排除 */
  private async fetchSeasonItems(): Promise<VodItem[]> {
    const slugs = currentSeasonSlugs()
    const all = await Promise.all(
      slugs.map((slug) =>
        this.paginate<VodItem, number>({
          initial: 0,
          fetchPage: (from) => fetchHuluPalettePage(slug, from)
        }).catch((e) => {
          this.logger.error({
            action: 'fetch-season-palette-failed',
            slug,
            error: e instanceof Error ? e.message : String(e)
          })
          return [] as VodItem[]
        })
      )
    )
    return this.dedupeBy(all.flat(), (i) => i.slug)
  }

  protected fetchNewEpisode(): Promise<Title[]> {
    return this.fetchRecentAndSeason('new_episode')
  }

  protected fetchComingSoon(): Promise<Title[]> {
    return this.fetchRecentAndSeason('coming_soon')
  }

  /** 配信終了間近: Filtered API (publish_end_at 昇順、30日以内) */
  protected async fetchExpiring(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: 'expiring' })
    const cutoff = dayjs().add(30, 'day')
    const items = await this.paginate<VodItem, number>({
      initial: 0,
      fetchPage: async (from) => {
        const { items, next } = await fetchHuluExpiringPage(cutoff, from)
        return { items, next }
      }
    })
    const titles = this.dedupeBy(items, (i) => i.slug).map((item) => {
      const title = vodItemToTitle(item)
      if (item.endAt) {
        title.expiring = {
          remainingHours: Math.max(1, Math.ceil(dayjs(item.endAt.replace(/\//g, '-')).diff(dayjs(), 'hour'))),
          season: null
        }
      }
      return title
    })
    this.logger.info({ action: 'fetch-title-list-done', mode: 'expiring', count: titles.length })
    return titles
  }

  /** 全タイトル: Filtered API (g:8, TV + 映画) */
  protected async fetchCatalog(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: 'catalog' })
    const items = await this.paginate<VodItem, number>({
      initial: 0,
      fetchPage: async (from) => {
        const { items, next } = await fetchHuluFilteredPage('[{"values.weekly_uu":"desc"}]', from)
        return { items, next }
      }
    })
    const titles = this.dedupeBy(items, (i) => i.slug).map((i) => vodItemToTitle(i))
    this.logger.info({ action: 'fetch-title-list-done', mode: 'catalog', count: titles.length })
    return titles
  }

  /**
   * コンテンツ ID (slug) からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * RSC ペイロードと Falcor API を並列で呼び出しマージする。
   * @param contentId - Hulu のスラッグ (例: "dandadan")
   * @returns タイトル詳細情報
   */
  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    this.logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchHuluTitleDetail(contentId)
    this.logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
