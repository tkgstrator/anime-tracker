/**
 * D1 の anilist_media テーブルをローカル lookup して identify する。
 *
 * AniList の search backend が壊れている状況下でも動くように、事前に
 * scripts/sync/sync-anilist.ts で取得した anilist_media を引く。
 *
 * scripts/sync/import-catalog.ts の matching ロジックを Workers 側で
 * Prisma 経由で動くように移植したもの。
 */
import type { PrismaClient } from '../../generated/prisma/client.ts'
import type { TitleMetadata } from '../../schemas/providers/metadata.dto'
import { cleanTitle } from './anilist'
import { normalizeTitle } from './normalize'

/** D1 の bound parameter 上限。`IN (...)` で chunk する単位 */
const D1_VARIABLE_LIMIT = 100

const SEASON_TO_QUARTER: Record<string, number> = { WINTER: 0, SPRING: 1, SUMMER: 2, FALL: 3 }
const MONTH_TO_QUARTER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] as const

interface AnilistRow {
  id: number
  titleNative: string | null
  season: string | null
  seasonYear: number | null
  status: string
  startYear: number | null
  startMonth: number | null
  nativeNorm: string | null
  romajiNorm: string | null
  englishNorm: string | null
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size))
}

function toMetadata(row: AnilistRow): TitleMetadata | undefined {
  const year = row.seasonYear ?? row.startYear
  const quarter = row.season
    ? SEASON_TO_QUARTER[row.season]
    : row.startMonth != null
      ? MONTH_TO_QUARTER[row.startMonth - 1]
      : null
  if (year == null || quarter == null) return undefined
  if (!row.titleNative) return undefined
  return {
    aniListId: row.id,
    title: row.titleNative,
    status: row.status,
    year,
    quarter
  } as TitleMetadata
}

/**
 * 全 titles の normalized 形を一括収集し、100 件 chunk で
 * anilist_media を batched lookup して norm → row のマップを返す。
 */
async function buildLookup(prisma: PrismaClient, titles: string[]): Promise<Map<string, AnilistRow>> {
  const norms = new Set<string>()
  for (const t of titles) {
    const raw = normalizeTitle(t)
    if (raw) norms.add(raw)
    const cleaned = normalizeTitle(cleanTitle(t))
    if (cleaned) norms.add(cleaned)
  }

  const map = new Map<string, AnilistRow>()
  const select = {
    id: true,
    titleNative: true,
    season: true,
    seasonYear: true,
    status: true,
    startYear: true,
    startMonth: true,
    nativeNorm: true,
    romajiNorm: true,
    englishNorm: true
  } as const

  // 各 norm 列ごとに pass を分け、列ごとに 100 件 chunk で IN クエリ
  for (const column of ['nativeNorm', 'romajiNorm', 'englishNorm'] as const) {
    for (const chunk of chunkArray([...norms], D1_VARIABLE_LIMIT)) {
      const rows = await prisma.anilistMedia.findMany({
        where: { [column]: { in: chunk } },
        select,
        orderBy: [{ seasonYear: 'desc' }, { id: 'desc' }]
      })
      for (const r of rows) {
        const key = r[column]
        if (key && !map.has(key)) {
          map.set(key, r as AnilistRow)
        }
      }
    }
  }
  return map
}

/**
 * D1 の anilist_media を lookup して titles を identify する。
 * 元タイトルの normalized と cleanTitle 後の normalized の両方で試行。
 */
export async function identifyTitlesViaD1(
  prisma: PrismaClient,
  titles: string[]
): Promise<(TitleMetadata | undefined)[]> {
  if (titles.length === 0) return []
  const lookup = await buildLookup(prisma, titles)

  return titles.map((t) => {
    const rawNorm = normalizeTitle(t)
    if (rawNorm) {
      const hit = lookup.get(rawNorm)
      if (hit) {
        const m = toMetadata(hit)
        if (m) return m
      }
    }
    const cleanedNorm = normalizeTitle(cleanTitle(t))
    if (cleanedNorm && cleanedNorm !== rawNorm) {
      const hit = lookup.get(cleanedNorm)
      if (hit) {
        const m = toMetadata(hit)
        if (m) return m
      }
    }
    return undefined
  })
}
