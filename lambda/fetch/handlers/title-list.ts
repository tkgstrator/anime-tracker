/**
 * `/title_list` ハンドラ。
 * provider の new_episode / coming_soon / catalog カテゴリのタイトル一覧を整形して返す。
 */
import dayjs from 'dayjs'
import { logger } from '../logger'
import { getProvider } from '../provider'

/**
 * 指定 provider / category の title 一覧を取得して整形する。
 * catalog は provider によっては全件走査を意味するため呼び出し側で頻度を制御すること。
 *
 * @param providerName  対象 provider 名
 * @param category      new_episode / coming_soon / catalog のいずれか
 * @returns fetchedAt と entries の pair
 */
export async function fetchTitleList(
  providerName: string,
  category: 'new_episode' | 'coming_soon' | 'catalog'
) {
  const provider = getProvider(providerName)
  const titles = await provider.fetchTitleList({ category })

  const entries = titles.map((t) => ({
    contentId: t.contentId,
    title: t.title,
    description: t.description,
    entityType: t.entityType,
    imageUrl: t.imageUrl,
    maturityRating: t.maturityRating,
    nextEpisodeDate: t.nextEpisodeDate,
    badge: t.badge
  }))

  logger.info({
    action: 'fetch-title-list',
    provider: providerName,
    category,
    count: entries.length
  })
  return { fetchedAt: dayjs().toISOString(), entries }
}
