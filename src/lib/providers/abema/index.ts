import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { fetchModules, moduleItemToTitle } from './browse'
import { fetchAbemaTitleDetail } from './detail'

const logger = getAppLogger('abema')

export class AbemaProvider extends Provider {
  readonly name = 'abema'

  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const category = options?.category

    if (category === 'expiring') {
      logger.info({ action: 'fetch-title-list-skip', mode: 'expiring' })
      return []
    }

    if (category === 'coming_soon') {
      logger.info({ action: 'fetch-title-list-skip', mode: 'coming_soon' })
      return []
    }

    return this.fetchNewEpisodes()
  }

  private async fetchNewEpisodes(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'new_episode' })
    const items = await fetchModules()
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const item of items) {
      const badge = item.label?.newest === true ? 'NEW_EPISODE' : 'RECENTLY_ADDED'
      const title = moduleItemToTitle(item, badge)

      if (!title.contentId || seen.has(title.contentId)) continue
      seen.add(title.contentId)
      titles.push(title)
    }

    logger.info({ action: 'fetch-title-list-done', mode: 'new_episode', count: titles.length })
    return titles
  }

  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchAbemaTitleDetail(contentId)
    logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
