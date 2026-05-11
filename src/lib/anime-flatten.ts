/**
 * Anime + AnilistMedia の relational fetch 結果を、フロント DTO 互換の
 * フラットな形 (year/quarter/status を anime 直下に持つ) に変換する。
 *
 * anime テーブルからは year/quarter/status を削除し、anilist_media を
 * 権威ソースにしているため、API レスポンス組み立て時にここで JOIN 結果を平坦化する。
 */
import type { AnilistMedia, Anime } from '../generated/prisma/client.ts'

const SEASON_TO_QUARTER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
const MONTH_TO_QUARTER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] as const
export const QUARTER_TO_SEASON = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const

export type AnimeWithAnilistMedia = Anime & { anilistMedia: AnilistMedia }

export interface AnimeFlatExtras {
  year: number
  quarter: number
  status: string
}

export function deriveYearQuarterStatus(am: AnilistMedia): AnimeFlatExtras {
  const year = am.seasonYear ?? am.startYear ?? 0
  const quarter = am.season
    ? (SEASON_TO_QUARTER[am.season] ?? 0)
    : am.startMonth != null
      ? MONTH_TO_QUARTER[am.startMonth - 1]
      : 0
  return { year, quarter, status: am.status }
}

export function flattenAnime<T extends AnimeWithAnilistMedia>(row: T): Omit<T, 'anilistMedia'> & AnimeFlatExtras {
  const { anilistMedia, ...rest } = row
  return { ...rest, ...deriveYearQuarterStatus(anilistMedia) }
}
