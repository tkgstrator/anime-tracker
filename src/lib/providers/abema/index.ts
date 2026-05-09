import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import { getAppLogger } from '../../logger'
import { type FetchTitleListOptions, Provider } from '../base'
import { cardToTitle, fetchCards } from './browse'
import { fetchAbemaTitleDetail } from './detail'

const logger = getAppLogger('abema')

export class AbemaProvider extends Provider {
  readonly name = 'abema'

  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const category = options?.category

    if (category === 'new_episode') {
      return this.fetchNewEpisodes()
    }

    return this.fetchAll()
  }

  private async fetchNewEpisodes(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'new_episode' })
    const cards = await fetchCards()
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const card of cards) {
      if (!card.label?.newest) continue
      if (seen.has(card.seriesId)) continue
      seen.add(card.seriesId)

      const title = cardToTitle(card)
      title.badge = 'NEW_EPISODE'
      titles.push(title)
    }

    logger.info({ action: 'fetch-title-list-done', mode: 'new_episode', count: titles.length })
    return titles
  }

  private async fetchAll(): Promise<Title[]> {
    logger.info({ action: 'fetch-title-list-start', mode: 'all' })
    const cards = await fetchCards()
    const seen = new Set<string>()
    const titles: Title[] = []

    for (const card of cards) {
      if (seen.has(card.seriesId)) continue
      seen.add(card.seriesId)
      titles.push(cardToTitle(card))
    }

    logger.info({ action: 'fetch-title-list-done', mode: 'all', count: titles.length })
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
