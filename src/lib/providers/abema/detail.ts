import dayjs from 'dayjs'
import {
  buildImageUrl,
  type OrderedSeason,
  type Program,
  ProgramBroadcastResponseSchema,
  ProgramsResponseSchema,
  SeriesDetailSchema
} from '../../../schemas/providers/abema.dto'
import type { Episode, Season, TitleInfo } from '../../../schemas/providers/common.dto'
import { abemaGet } from './browse'

const API_BASE = 'https://api.p-c3-e.abema-tv.com'

async function fetchSeriesDetail(seriesId: string) {
  const raw = await abemaGet(`${API_BASE}/v1/video/series/${seriesId}`, {})
  const result = SeriesDetailSchema.safeParse(raw)
  if (!result.success) throw result.error
  return result.data
}

async function fetchPrograms(seriesId: string, seasonId: string): Promise<Program[]> {
  const raw = await abemaGet(`${API_BASE}/v1/video/series/${seriesId}/programs`, {
    seasonId,
    limit: '100'
  })
  const result = ProgramsResponseSchema.safeParse(raw)
  if (!result.success) throw result.error
  return result.data.programs
}

async function fetchBroadcastDate(programId: string): Promise<number | null> {
  const raw = await abemaGet(`${API_BASE}/v1/video/b/programs/${programId}`, {}).catch(() => null)
  if (!raw) return null
  const result = ProgramBroadcastResponseSchema.safeParse(raw)
  if (!result.success) return null
  return result.data.data.broadcastDate ?? null
}

function buildProgramImageUrl(programId: string, thumbImg?: string): string {
  if (!thumbImg) return 'https://abema.tv/favicon.ico'
  return `https://image.p-c2-x.abema-tv.com/image/programs/${programId}/${thumbImg}.png`
}

function mapProgram(program: Program, broadcastDate: number | null): Episode | null {
  const ep = program.episode
  if (!ep) return null
  if (!Number.isInteger(ep.number) || ep.number < 0) return null

  const released = program.credit?.released
  const releaseDate = broadcastDate
    ? dayjs.unix(broadcastDate).toISOString()
    : released
      ? dayjs(`${released}-01-01`).toISOString()
      : dayjs().toISOString()

  return {
    episodeNumber: ep.number,
    episodeId: program.id,
    title: ep.title || `Episode ${ep.number}`,
    description: ep.content || ep.title || `Episode ${ep.number}`,
    releaseDate,
    duration: program.info?.duration ?? 0,
    maturityRating: null,
    imageUrl: buildProgramImageUrl(
      program.id,
      program.providedInfo?.sceneThumbImgs?.[0] ?? program.providedInfo?.thumbImg
    ),
    hasSubtitles: false,
    hasDub: false,
    benefitId: 'abema'
  }
}

export async function fetchAbemaTitleDetail(seriesId: string): Promise<TitleInfo> {
  const series = await fetchSeriesDetail(seriesId)

  const mainSeasons = series.orderedSeasons.filter((s) => s.episodeGroups.some((eg) => eg.name === '本編'))
  const targetSeasons = mainSeasons.length > 0 ? mainSeasons : series.orderedSeasons

  const seasonPrograms = await Promise.all(targetSeasons.map((s) => fetchPrograms(seriesId, s.id)))

  const imageUrl = (() => {
    const first = targetSeasons[0]?.thumbComponent
    return first ? buildImageUrl(first) : 'https://abema.tv/favicon.ico'
  })()

  const broadcastDates = await Promise.all(
    seasonPrograms.map((programs) => Promise.all(programs.map((p) => fetchBroadcastDate(p.id))))
  )

  const seasons: Season[] = targetSeasons.map((s: OrderedSeason, i: number) => ({
    seasonId: s.id,
    displayName: s.name || `Season ${s.sequence}`,
    seasonNumber: s.sequence || i + 1,
    episodes: seasonPrograms[i]
      .map((p, j) => mapProgram(p, broadcastDates[i][j]))
      .filter((ep): ep is Episode => ep !== null)
  }))

  return {
    title: series.title,
    description: series.content,
    entityType: 'tv',
    maturityRating: null,
    imageUrl,
    seasons
  }
}
