/**
 * `/expiring` ハンドラ。
 * provider から「配信終了間近」タイトル一覧を取り、JST 日次境界に丸めた expiredAt を付けて返す。
 */
import dayjs from 'dayjs'
import { logger } from '../logger'
import { getProvider } from '../provider'

/**
 * 指定 provider の「配信終了間近」タイトル一覧を取得し、
 * 各エントリの expiredAt を JST 日次境界の ISO 文字列に丸めて返す。
 *
 * @param provider  対象 provider 名 (hulu / crunchyroll / abema / amazon)
 * @returns fetchedAt と entries の pair
 */
export async function fetchExpiring(provider: string) {
  const p = getProvider(provider)
  const titles = await p.fetchTitleList({ category: 'expiring' })

  const now = dayjs()
  const entries = titles
    .filter((t) => t.expiring)
    .map((t) => {
      const raw = now.add(t.expiring!.remainingHours, 'hour')
      const expiredAt = raw.utcOffset(9).startOf('day').toISOString()
      return {
        contentId: t.contentId,
        expiredAt,
        expiringSeason: t.expiring!.season
      }
    })

  logger.info({ action: 'fetch-expiring', provider, count: entries.length })
  return { fetchedAt: now.toISOString(), entries }
}
