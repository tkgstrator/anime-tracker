import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { browseItemToTitle, fetchBrowse } from './browse'
import { fetchCrunchyrollTitleDetail } from './detail'

const logger = getAppLogger('crunchyroll')

/**
 * Crunchyroll プロバイダ。
 *
 * Crunchyroll の公開 API (content/v2) からアニメタイトル一覧を取得し、
 * CMS API からシーズン・エピソード情報を取得する。
 *
 * NOTE: Crunchyroll API は US リージョンから呼び出す必要がある。
 */
export class CrunchyrollProvider extends Provider {
  readonly name = 'crunchyroll'

  /**
   * Crunchyroll のアニメタイトル一覧を取得する。
   *
   * - `new_episode`: newly_added ソートで取得、new=true のものを NEW_EPISODE として返す
   * - `coming_soon`: 空配列を返す (Crunchyroll の Browse API では coming_soon を区別できない)
   * - `expiring`: 空配列を返す (Crunchyroll は配信終了情報を公開 API で提供しない)
   * - 未指定: alphabetical ソートで全タイトルを取得
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const category = options?.category

    if (category === 'new_episode') {
      return this.fetchNewEpisodes()
    }
    if (category === 'coming_soon' || category === 'expiring') {
      logger.info({ action: 'fetch-title-list-skip', mode: category })
      return []
    }
    return this.fetchAll()
  }

  /** 新着エピソード: newly_added ソートで取得 */
  private async fetchNewEpisodes(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'new_episode' })
    // 新着200件を取得して new フラグで判定
    const items = await fetchBrowse('newly_added', 200)
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      titles.push(browseItemToTitle(item, item.new ? 'NEW_EPISODE' : 'RECENTLY_ADDED'))
    }

    logger.info({ action: 'fetch-title-list-done', mode: 'new_episode', count: titles.length })
    return titles
  }

  /** 全タイトル: alphabetical ソートで全件取得 */
  private async fetchAll(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'all' })
    const items = await fetchBrowse('alphabetical')
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const item of items) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      titles.push(browseItemToTitle(item))
    }

    logger.info({ action: 'fetch-title-list-done', mode: 'all', count: titles.length })
    return titles
  }

  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchCrunchyrollTitleDetail(contentId)
    logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
