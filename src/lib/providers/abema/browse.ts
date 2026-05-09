import { buildImageUrl, type GenreCard, GenreCardsResponseSchema } from '../../../schemas/providers/abema.dto'
import type { Title } from '../../../schemas/providers/common.dto'
import { getAccessToken } from './auth'

const CARDS_URL = 'https://api.p-c3-e.abema-tv.com/v1/video/featureGenres/animation/cards'

export async function abemaGet(url: string, params: Record<string, string>): Promise<unknown> {
  const token = await getAccessToken()
  const u = new URL(url)
  for (const [k, v] of Object.entries(params)) {
    u.searchParams.set(k, v)
  }
  const res = await fetch(u.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      Referer: 'https://abema.tv/'
    }
  })
  if (!res.ok) {
    throw new Error(`ABEMA API error: ${res.status} ${res.statusText} (${u.pathname})`)
  }
  return res.json()
}

export function cardToTitle(card: GenreCard): Title {
  const thumb = card.thumbComponent
  const imageUrl = thumb ? buildImageUrl(thumb) : 'https://abema.tv/favicon.ico'

  return {
    contentId: card.seriesId,
    title: card.title,
    description: card.title,
    entityType: 'tv',
    imageUrl,
    maturityRating: null,
    nextEpisodeDate: undefined,
    badge: undefined
  }
}

export async function fetchCards(): Promise<GenreCard[]> {
  const allCards: GenreCard[] = []
  let next: string | undefined

  do {
    const params: Record<string, string> = { limit: '20', onlyFree: 'false' }
    if (next) params.next = next

    const raw = await abemaGet(CARDS_URL, params)
    const result = GenreCardsResponseSchema.safeParse(raw)
    if (!result.success) throw result.error

    allCards.push(...result.data.cards)
    next = result.data.paging?.next
  } while (next)

  return allCards
}
