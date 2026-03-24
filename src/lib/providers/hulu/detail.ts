import { HuluEpisodesSchema, type HuluEpisode } from '../../../schemas/hulu.dto'
import type { Episode, Season, TitleInfo } from '../../../schemas/provider.dto'
import { extractMetasArray } from './rsc-parser'

const HULU_BASE = 'https://www.hulu.jp'
const HULU_FALCOR_API = `${HULU_BASE}/anon/ja/webp/path`

/**
 * Hulu のエピソード詳細を Episode 型にマッピングする。
 */
function mapToEpisode(ep: HuluEpisode, index: number): Episode {
  return {
    episodeNumber: ep.additionalInfo.card_info.episode_number_title ?? index + 1,
    episodeId: String(ep.id_in_schema),
    title: ep.additionalInfo.short_name ?? ep.title,
    description: ep.description,
    releaseDate: ep.startAt,
    duration: Math.round(ep.additionalInfo.episode_runtime),
    maturityRating: null,
    imageUrl: ep.imageUrl,
    hasSubtitles: ep.additionalInfo.card_info.has_ja_caption,
    hasDub: false,
    benefitId: 'hulu'
  }
}

interface SeriesMeta {
  description: string
  imageUrl: string
}

/**
 * Falcor JSON Graph API からシリーズの description と imageUrl を取得する。
 */
async function fetchSeriesMeta(seriesId: number): Promise<SeriesMeta> {
  const paths = JSON.stringify([['meta', `series:${seriesId}`, ['description', 'imageUrl']]])
  const url = `${HULU_FALCOR_API}?paths=${encodeURIComponent(paths)}&method=get`
  const res = await fetch(url)
  if (!res.ok) return { description: '', imageUrl: '' }
  const data = (await res.json()) as {
    jsonGraph: {
      meta: Record<string, { description?: { value?: string }; imageUrl?: { value?: string } }>
    }
  }
  const meta = data.jsonGraph.meta[`series:${seriesId}`]
  return {
    description: meta?.description?.value ?? '',
    imageUrl: meta?.imageUrl?.value ?? ''
  }
}

/**
 * エピソード群をシーズンごとにグループ化する。
 */
function groupIntoSeasons(slug: string, episodes: HuluEpisode[]): Season[] {
  const seasonMap = new Map<string, HuluEpisode[]>()
  for (const ep of episodes) {
    const seasonName = ep.additionalInfo.card_info.season_number_title ?? 'シーズン1'
    const list = seasonMap.get(seasonName) ?? []
    list.push(ep)
    seasonMap.set(seasonName, list)
  }

  return Array.from(seasonMap.entries(), ([seasonName, eps], i) => ({
    seasonId: `hulu-${slug}-s${i + 1}`,
    displayName: seasonName,
    seasonNumber: i + 1,
    imageUrl: eps[0]?.imageUrl,
    episodes: eps.map((ep, idx) => mapToEpisode(ep, idx))
  }))
}

/**
 * HTML の RSC ペイロードからエピソード一覧をパースする。
 */
export function parseEpisodesFromHtml(html: string): HuluEpisode[] {
  const raw = extractMetasArray(html)
  return HuluEpisodesSchema.parse(raw)
}

/**
 * Hulu のタイトル詳細ページからエピソード・シーズン情報を取得する。
 */
export async function fetchHuluTitleDetail(slug: string): Promise<TitleInfo> {
  const url = `${HULU_BASE}/${slug}/assets?ht=episode`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Hulu episode page error: ${res.status} ${res.statusText} (${url})`)
  }
  const html = await res.text()
  const episodes = parseEpisodesFromHtml(html)
  const firstEp = episodes[0]
  if (!firstEp) {
    throw new Error(`No episodes found for slug: ${slug}`)
  }

  const seriesTitle = firstEp.title.replace(/\s+シーズン\d+.*/, '').replace(/\s+第\d+話.*/, '')
  const seasons = groupIntoSeasons(slug, episodes)
  const { description } = await fetchSeriesMeta(firstEp.additionalInfo.series_id)

  return {
    title: seriesTitle,
    description,
    entityType: 'tv',
    maturityRating: null,
    benefitId: 'hulu',
    seasons
  }
}
