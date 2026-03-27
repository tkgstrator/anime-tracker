/**
 * 日本 IP が必要な fetch を代行する Lambda ハンドラ。
 *
 * AWS Lambda (ap-northeast-1) で実行し、日本 IP からの fetch を保証する。
 * fetch → 整形 → レスポンスとして返す。KV/DB は触らない。
 *
 * パスベースルーティング:
 *   POST /expiring     — 配信終了間近タイトル取得
 *   POST /new_episode  — 最新エピソード取得
 */
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AmazonProvider } from '../../src/lib/providers/amazon'
import { HuluProvider } from '../../src/lib/providers/hulu'

dayjs.extend(utc)

// ---- expiring ----

async function fetchExpiring(provider: string) {
  if (provider !== 'amazon') {
    return { statusCode: 400, body: JSON.stringify({ error: `Unsupported provider for expiring: ${provider}` }) }
  }

  const amazon = new AmazonProvider()
  const titles = await amazon.fetchTitleList({ expiringOnly: true })

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

  console.log(`Fetched ${entries.length} expiring entries for ${provider}`)
  if (entries.length === 0) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No expiring entries found' }) }
  }
  return { statusCode: 200, body: JSON.stringify({ fetchedAt: now.toISOString(), entries }) }
}

// ---- new_episode ----

async function fetchNewEpisode(providerName: string) {
  const provider = providerName === 'hulu' ? new HuluProvider() : new AmazonProvider()
  const titles = await provider.fetchTitleList({ newEpisodesOnly: true })

  const entries = titles.map((t) => ({
    contentId: t.contentId,
    title: t.title,
    description: t.description,
    entityType: t.entityType,
    imageUrl: t.imageUrl,
    maturityRating: t.maturityRating,
    benefitId: t.benefitId,
    nextEpisodeDate: t.nextEpisodeDate ?? null,
    hasNewContent: t.hasNewContent ?? true
  }))

  console.log(`Fetched ${entries.length} new episode entries for ${providerName}`)
  return { statusCode: 200, body: JSON.stringify({ fetchedAt: dayjs().toISOString(), entries }) }
}

// ---- handler ----

const ROUTES: Record<string, (provider: string) => Promise<{ statusCode: number; body: string }>> = {
  '/expiring': fetchExpiring,
  '/new_episode': fetchNewEpisode
}

// biome-ignore lint: Lambda event type varies by invocation method
export async function handler(event: any): Promise<{ statusCode: number; body: string }> {
  // Function URL: event.rawPath でルーティング、event.body にJSONが入る
  // 直接呼び出し: event.path と event で直接アクセス
  const path = event.rawPath ?? event.path ?? '/'
  const body = event.body ? JSON.parse(event.body) : event

  const route = ROUTES[path]
  if (!route) {
    return { statusCode: 404, body: JSON.stringify({ error: `Unknown path: ${path}` }) }
  }

  const { provider } = body
  if (!provider) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing provider' }) }
  }

  console.log(`${path} provider=${provider}`)
  return route(provider)
}
