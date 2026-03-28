/**
 * 日本 IP が必要な fetch を代行する Lambda ハンドラ。
 *
 * AWS Lambda (ap-northeast-1) で実行し、日本 IP からの fetch を保証する。
 * fetch → 整形 → レスポンスとして返す。KV/DB は触らない。
 *
 * パスベースルーティング:
 *   POST /expiring     — 配信終了間近タイトル取得
 *   POST /title_list   — 新着エピソード / 最近更新タイトル取得
 */
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { AmazonProvider } from '../../src/lib/providers/amazon'
import { HuluProvider } from '../../src/lib/providers/hulu'
import type { Provider } from '../../src/lib/providers/base'

dayjs.extend(utc)

function getProvider(name: string): Provider {
  if (name === 'hulu') return new HuluProvider()
  return new AmazonProvider()
}

// ---- expiring ----

async function fetchExpiring(provider: string) {
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

  console.log(`Fetched ${entries.length} expiring entries for ${provider}`)
  if (entries.length === 0) {
    return { statusCode: 500, body: JSON.stringify({ error: 'No expiring entries found' }) }
  }
  return { statusCode: 200, body: JSON.stringify({ fetchedAt: now.toISOString(), entries }) }
}

// ---- title_list (new_episode / recently_added) ----

async function fetchTitleList(providerName: string, category: string) {
  if (category !== 'new_episode' && category !== 'recently_added' && category !== 'coming_soon') {
    return { statusCode: 400, body: JSON.stringify({ error: `Invalid category: ${category}` }) }
  }

  const provider = getProvider(providerName)
  const titles = await provider.fetchTitleList({ category })

  const entries = titles.map((t) => ({
    contentId: t.contentId,
    title: t.title,
    description: t.description,
    entityType: t.entityType,
    imageUrl: t.imageUrl,
    maturityRating: t.maturityRating,
    benefitId: t.benefitId,
    nextEpisodeDate: t.nextEpisodeDate ?? null,
    badge: t.badge ?? null
  }))

  console.log(`Fetched ${entries.length} ${category} entries for ${providerName}`)
  return { statusCode: 200, body: JSON.stringify({ fetchedAt: dayjs().toISOString(), entries }) }
}

// ---- handler ----

// biome-ignore lint: Lambda event type varies by invocation method
export async function handler(event: any): Promise<{ statusCode: number; body: string }> {
  // Function URL: event.rawPath でルーティング、event.body にJSONが入る
  // 直接呼び出し: event.path と event で直接アクセス
  const path = event.rawPath ?? event.path ?? '/'
  const body = event.body ? JSON.parse(event.body) : event

  const { provider } = body
  if (!provider) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing provider' }) }
  }

  console.log(`${path} provider=${provider}`)

  switch (path) {
    case '/expiring':
      return fetchExpiring(provider)
    case '/title_list':
      return fetchTitleList(provider, body.category)
    default:
      return { statusCode: 404, body: JSON.stringify({ error: `Unknown path: ${path}` }) }
  }
}
