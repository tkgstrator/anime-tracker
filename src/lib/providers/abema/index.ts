import type { Title, TitleInfo } from '../../../schemas/providers/common.dto'
import { Provider } from '../base'
import { cardToTitle, fetchCards } from './browse'
import { fetchAbemaTitleDetail } from './detail'

export class AbemaProvider extends Provider {
  readonly name = 'abema'

  protected async fetchNewEpisode(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: 'new_episode' })
    const cards = await fetchCards()
    const newest = cards.filter((c) => c.label?.newest)
    const titles = this.dedupeBy(newest, (c) => c.seriesId).map((c) => {
      const t = cardToTitle(c)
      t.badge = 'NEW_EPISODE'
      return t
    })
    this.logger.info({ action: 'fetch-title-list-done', mode: 'new_episode', count: titles.length })
    return titles
  }

  protected async fetchCatalog(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-start', mode: 'catalog' })
    const cards = await fetchCards()
    const titles = this.dedupeBy(cards, (c) => c.seriesId).map((c) => cardToTitle(c))
    this.logger.info({ action: 'fetch-title-list-done', mode: 'catalog', count: titles.length })
    return titles
  }

  async fetchTitleInfo(contentId: string): Promise<TitleInfo> {
    this.logger.debug({ action: 'fetch-title-info-start', contentId })
    const detail = await fetchAbemaTitleDetail(contentId)
    this.logger.debug({
      action: 'fetch-title-info-done',
      contentId,
      title: detail.title,
      seasonCount: detail.seasons.length
    })
    return detail
  }
}
