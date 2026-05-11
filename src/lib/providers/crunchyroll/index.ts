import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import type { BrowseItem } from '../../../schemas/providers/crunchyroll.dto'
import { Provider } from '../base'
import { browseItemToTitle, fetchBrowsePage } from './browse'
import { fetchCrunchyrollTitleDetail } from './detail'

/**
 * Crunchyroll プロバイダ。
 *
 * Crunchyroll の公開 API (content/v2) からアニメタイトル一覧を取得し、
 * CMS API からシーズン・エピソード情報を取得する。
 *
 * NOTE: Crunchyroll API は US リージョンから呼び出す必要がある。
 * NOTE: coming_soon / expiring は API で区別できないため base のデフォルト (空配列) を使う。
 */
export class CrunchyrollProvider extends Provider {
  readonly name = 'crunchyroll'

  private async browseAll(sortBy: string, maxItems = 0): Promise<BrowseItem[]> {
    const raw = await this.paginate<BrowseItem, number>({
      initial: 0,
      fetchPage: async (start) => {
        const { items, next } = await fetchBrowsePage(sortBy, start, maxItems)
        return { items, next }
      }
    })
    return maxItems > 0 ? raw.slice(0, maxItems) : raw
  }

  protected async fetchNewEpisode(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: 'new_episode' })
    // 新着 200 件を取得して new フラグで判定
    const items = await this.browseAll('newly_added', 200)
    const titles = this.dedupeBy(items, (i) => i.id).map((i) =>
      browseItemToTitle(i, i.new ? 'NEW_EPISODE' : 'RECENTLY_ADDED')
    )
    this.logger.info({ action: 'fetch-title-list-done', mode: 'new_episode', count: titles.length })
    return titles
  }

  protected async fetchCatalog(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: 'catalog' })
    const items = await this.browseAll('alphabetical')
    const titles = this.dedupeBy(items, (i) => i.id).map((i) => browseItemToTitle(i))
    this.logger.info({ action: 'fetch-title-list-done', mode: 'catalog', count: titles.length })
    return titles
  }

  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    this.logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchCrunchyrollTitleDetail(contentId)
    this.logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
