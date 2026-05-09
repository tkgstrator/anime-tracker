import dayjs from 'dayjs'
import type { Episode, Season, TitleInfo } from '../../../schemas/providers/common.dto'
import {
  type EpisodeItem,
  EpisodesResponseSchema,
  getBestImageUrl,
  getBestThumbnailUrl,
  type SeasonItem,
  SeasonsResponseSchema,
  SeriesDetailResponseSchema
} from '../../../schemas/providers/crunchyroll.dto'
import { crunchyrollGet } from './browse'

/** maturity rating 文字列を数値に変換する */
function parseMaturityRating(ratings: string[]): number | null {
  for (const r of ratings) {
    const m = r.match(/(\d+)/)
    if (m) return Number(m[1])
  }
  return null
}

/** EpisodeItem → Episode（非整数エピソード番号の特別編はスキップ） */
function mapEpisode(ep: EpisodeItem): Episode | null {
  const raw = ep.episode_number ?? Number(ep.episode)
  if (!Number.isInteger(raw) || raw < 0) return null
  const episodeNumber = raw
  const releaseDate = ep.premium_available_date ?? ep.episode_air_date ?? ep.upload_date ?? ''
  const thumbnailUrl = ep.images ? getBestThumbnailUrl(ep.images) : null
  const hasJaSub = ep.subtitle_locales.includes('ja-JP')
  const isJaAudio = ep.audio_locale === 'ja-JP'

  return {
    episodeNumber,
    episodeId: ep.id,
    title: ep.title || `Episode ${episodeNumber}`,
    description: ep.description || ep.title || `Episode ${episodeNumber}`,
    releaseDate: releaseDate ? dayjs(releaseDate).toISOString() : dayjs().toISOString(),
    duration: ep.duration_ms ? Math.round(ep.duration_ms / 1000) : 0,
    maturityRating: null,
    imageUrl: thumbnailUrl ?? 'https://www.crunchyroll.com/build/assets/img/default-poster.png',
    hasSubtitles: hasJaSub || ep.is_subbed,
    hasDub: !isJaAudio && ep.is_dubbed,
    benefitId: 'crunchyroll'
  }
}

/**
 * シリーズのシーズン一覧を取得する。
 * preferred_audio_language=ja-JP で日本語版シーズンを優先する。
 */
async function fetchSeasons(seriesId: string): Promise<SeasonItem[]> {
  const raw = await crunchyrollGet(`/content/v2/cms/series/${seriesId}/seasons`, {
    locale: 'ja-JP',
    preferred_audio_language: 'ja-JP'
  })
  const result = SeasonsResponseSchema.safeParse(raw)
  if (!result.success) throw result.error
  return result.data.data
}

/** シーズンのエピソード一覧を取得する */
async function fetchEpisodes(seasonId: string): Promise<EpisodeItem[]> {
  const raw = await crunchyrollGet(`/content/v2/cms/seasons/${seasonId}/episodes`, {
    locale: 'ja-JP'
  })
  const result = EpisodesResponseSchema.safeParse(raw)
  if (!result.success) throw result.error
  return result.data.data
}

/**
 * SeasonItem を日本語音声版のみにフィルタし、season_number ごとに重複を排除する。
 * 同一 season_number に複数バージョンがある場合、ja-JP を優先する。
 */
function filterJapaneseSeasons(seasons: SeasonItem[]): SeasonItem[] {
  const byNumber = new Map<number, SeasonItem>()
  for (const s of seasons) {
    const existing = byNumber.get(s.season_number)
    if (!existing) {
      byNumber.set(s.season_number, s)
      continue
    }
    // ja-JP 音声を優先
    if (s.audio_locale === 'ja-JP' && existing.audio_locale !== 'ja-JP') {
      byNumber.set(s.season_number, s)
    }
  }
  return Array.from(byNumber.values()).sort((a, b) => a.season_number - b.season_number)
}

/**
 * Crunchyroll のタイトル詳細を取得する。
 * Series API → Seasons API → Episodes API を順番に呼び出す。
 */
export async function fetchCrunchyrollTitleDetail(seriesId: string): Promise<TitleInfo> {
  // シリーズ情報とシーズン一覧を並列取得
  const [seriesRaw, allSeasons] = await Promise.all([
    crunchyrollGet(`/content/v2/cms/series/${seriesId}`, { locale: 'ja-JP' }),
    fetchSeasons(seriesId)
  ])

  const result = SeriesDetailResponseSchema.safeParse(seriesRaw)
  if (!result.success) throw result.error
  const seriesData = result.data.data[0]
  if (!seriesData) throw new Error(`Series not found: ${seriesId}`)

  const jaSeasons = filterJapaneseSeasons(allSeasons)

  // 各シーズンのエピソードを並列取得
  const seasonEpisodes = await Promise.all(jaSeasons.map((s) => fetchEpisodes(s.id)))

  const titleImageUrl = getBestImageUrl(seriesData.images) ?? 'https://www.crunchyroll.com/build/assets/img/default-poster.png'

  const seasons: Season[] = jaSeasons.map((s, i) => ({
    seasonId: s.id,
    displayName: s.title,
    seasonNumber: s.season_number || i + 1,
    imageUrl: titleImageUrl,
    episodes: seasonEpisodes[i].map((ep) => mapEpisode(ep)).filter((ep): ep is Episode => ep !== null)
  }))

  return {
    title: seriesData.title,
    description: seriesData.description || seriesData.title,
    entityType: 'tv',
    maturityRating: parseMaturityRating(seriesData.maturity_ratings),
    imageUrl: titleImageUrl,
    seasons
  }
}
