import { buildImageUrl, type ModuleItem, ModulesResponseSchema } from '../../../schemas/providers/abema.dto'
import type { Title } from '../../../schemas/providers/common.dto'
import { getAccessToken } from './auth'

const MODULES_URL = 'https://user-content-api.p-c3-e.abema-tv.com/v1/modules'
const SPOT_ID = 'Y7VprEEWs8'

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

function extractSeriesId(rawId: string): string {
  return rawId.replace(/_s\d+.*$/, '')
}

function getSeriesId(item: ModuleItem): string | undefined {
  if (item.contentGroupId) return item.contentGroupId
  if (!item.contentId) return undefined
  return extractSeriesId(item.contentId)
}

function getImageUrl(item: ModuleItem): string {
  const thumb = item.thumbPortrait ?? item.thumb
  return thumb ? buildImageUrl(thumb) : 'https://abema.tv/favicon.ico'
}

export function moduleItemToTitle(item: ModuleItem, badge?: Title['badge']): Title {
  const seriesId = getSeriesId(item) ?? ''
  const title = item.contentGroupTitle ?? item.contentTitle ?? item.title
  const isNewest = item.label?.newest === true

  return {
    contentId: seriesId,
    title,
    description: item.contentDescription || title,
    entityType: 'tv',
    imageUrl: getImageUrl(item),
    maturityRating: null,
    nextEpisodeDate: undefined,
    badge: badge ?? (isNewest ? 'NEW_EPISODE' : 'RECENTLY_ADDED')
  }
}

export async function fetchModules(): Promise<ModuleItem[]> {
  const raw = await abemaGet(MODULES_URL, {
    spotId: SPOT_ID,
    spotVersion: '1',
    limit: '20',
    qos: 'PC',
    qpl: 'web'
  })

  const result = ModulesResponseSchema.safeParse(raw)
  if (!result.success) throw result.error

  const seriesModules = result.data.modules.filter(
    (m) => m.itemUiType === 'ITEM_UI_TYPE_SERIES_FEATURE' || m.itemUiType === 'ITEM_UI_TYPE_CONTENT_FEATURE'
  )

  return seriesModules.flatMap((m) => m.items).filter((item) => item.contentId)
}
