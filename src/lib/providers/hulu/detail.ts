import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import type { Episode, Season, TitleInfo } from '../../../schemas/providers/common.dto'
import {
  EpisodesSchema,
  type FalcorMeta,
  FalcorMetaResponseSchema,
  type Episode as HuluEpisode
} from '../../../schemas/providers/hulu.dto'
import { getAppLogger } from '../../logger'
import { extractMetasArray } from './rsc-parser'

dayjs.extend(utc)
dayjs.extend(timezone)

const logger = getAppLogger('hulu-detail')

const HULU_BASE = 'https://www.hulu.jp'
const HULU_FALCOR_API = `${HULU_BASE}/anon/ja/webp/path`

/**
 * Hulu の日付文字列を JST としてパースし、ISO 8601 (UTC) に変換する。
 * "2026/03/25 00:30:00" → "2026-03-24T15:30:00.000Z"
 */
export function parseHuluDate(dateStr: string): string {
  return dayjs.tz(dateStr, 'Asia/Tokyo').toISOString()
}

/**
 * Hulu のエピソード詳細を Episode 型にマッピングする。
 */
function mapToEpisode(ep: HuluEpisode, index: number): Episode {
  return {
    episodeNumber: ep.additionalInfo.card_info.episode_number_title ?? index + 1,
    episodeId: String(ep.id_in_schema),
    title: ep.additionalInfo.short_name ?? ep.title,
    description: ep.description,
    releaseDate: parseHuluDate(ep.startAt),
    duration: Math.round(ep.additionalInfo.episode_runtime),
    maturityRating: null,
    imageUrl: ep.imageUrl,
    hasSubtitles: ep.additionalInfo.card_info.has_ja_caption,
    hasDub: false,
    benefitId: 'hulu'
  }
}

const SERIES_META_FIELDS = ['name', 'slug', 'description', 'thumbnailUrl', 'service'] as const

/**
 * Falcor JSON Graph API の titleSlug パスからシリーズのメタ情報を取得する。
 * slug → 内部ID の解決を Falcor 側で行うため、数値 ID は不要。
 */
export async function fetchSeriesMeta(slug: string): Promise<FalcorMeta> {
  const paths = JSON.stringify([['titleSlug', slug, [...SERIES_META_FIELDS]]])
  const url = `${HULU_FALCOR_API}?paths=${encodeURIComponent(paths)}&method=get`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Not Found Exception: ${slug}`)
  }
  const result = FalcorMetaResponseSchema.safeParse(await res.json())
  if (!result.success) throw result.error
  return result.data.jsonGraph.meta
  // const data = (await res.json()) as {
  //   jsonGraph: {
  //     meta: Record<string, Record<string, { value?: unknown }>>
  //   }
  // }
  // // titleSlug は ref で meta/{id} を返すので、meta 内の最初のエントリを取得
  // const meta = Object.values(data.jsonGraph.meta ?? {})[0]
  // return {
  //   name: String(meta?.name?.value ?? ''),
  //   slug: String(meta?.slug?.value ?? ''),
  //   description: String(meta?.description?.value ?? ''),
  //   thumbnailUrl: String(meta?.thumbnailUrl?.value ?? ''),
  //   service: String(meta?.service?.value ?? '')
  // }
}

/**
 * エピソード群をシーズンごとにグループ化する。
 */
function groupIntoSeasons(slug: string, episodes: HuluEpisode[], imageUrl: string): Season[] {
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
    imageUrl,
    episodes: eps.map((episode, i) => mapToEpisode(episode, i))
  }))
}

/**
 * HTML の RSC ペイロードからエピソード一覧をパースする。
 */
export function parseEpisodesFromHtml(html: string): HuluEpisode[] {
  const raw = extractMetasArray(html)
  const result = EpisodesSchema.safeParse(raw)
  if (!result.success) throw result.error
  return result.data
}

/**
 * RSC ペイロードからエピソード・シーズン情報を取得する。
 * エピソードが存在しない場合は null を返す。
 */
async function fetchEpisodesFromRsc(slug: string, imageUrl: string): Promise<{ episodes: HuluEpisode[]; seasons: Season[] } | null> {
  const url = `${HULU_BASE}/${slug}/assets?ht=episode`
  const res = await fetch(url)
  if (!res.ok) return null
  const html = await res.text()
  try {
    const episodes = parseEpisodesFromHtml(html)
    if (episodes.length === 0) return null
    return { episodes, seasons: groupIntoSeasons(slug, episodes, imageUrl) }
  } catch (e) {
    logger.warn({ action: 'parse-rsc-failed', slug, error: e instanceof Error ? e.message : String(e) })
    return null
  }
}

/**
 * Hulu のタイトル詳細を Falcor API + RSC から取得する。
 *
 * Falcor API からタイトルメタ情報を、RSC からエピソード・シーズン情報を
 * 並列で取得しマージして返す。タイトルメタは Falcor を正とする。
 */
export async function fetchHuluTitleDetail(slug: string): Promise<TitleInfo> {
  const meta = await fetchSeriesMeta(slug)
  const rsc = await fetchEpisodesFromRsc(slug, meta.imageUrl)

  return {
    title: meta.name,
    description: meta.description,
    entityType: 'tv',
    maturityRating: null,
    imageUrl: meta.imageUrl,
    seasons: rsc?.seasons ?? []
  }
}
