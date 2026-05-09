import dayjs from 'dayjs'
import {
  buildImageUrl,
  type OrderedSeason,
  type Program,
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

function buildProgramImageUrl(programId: string, thumbImg?: string): string {
  if (!thumbImg) return 'https://abema.tv/favicon.ico'
  return `https://image.p-c2-x.abema-tv.com/image/programs/${programId}/${thumbImg}`
}

function mapProgram(program: Program): Episode | null {
  const ep = program.episode
  if (!ep) return null
  if (!Number.isInteger(ep.number) || ep.number < 0) return null

  const released = program.credit?.released
  const releaseDate = released ? dayjs(`${released}-01-01`).toISOString() : dayjs().toISOString()

  return {
    episodeNumber: ep.number,
    episodeId: program.id,
    title: ep.title || `Episode ${ep.number}`,
    description: ep.content || ep.title || `Episode ${ep.number}`,
    releaseDate,
    duration: program.info?.duration ?? 0,
    maturityRating: null,
    imageUrl: buildProgramImageUrl(program.id, program.providedInfo?.thumbImg),
    hasSubtitles: false,
    hasDub: false,
    benefitId: null
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

  const seasons: Season[] = targetSeasons.map((s: OrderedSeason, i: number) => ({
    seasonId: s.id,
    displayName: s.name || `Season ${s.sequence}`,
    seasonNumber: s.sequence || i + 1,
    episodes: seasonPrograms[i].map((p) => mapProgram(p)).filter((ep): ep is Episode => ep !== null)
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
