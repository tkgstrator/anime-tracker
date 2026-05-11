/**
 * AniList anime media を年単位で fetch して D1 の anilist_media を Prisma 経由で upsert する。
 * Workers Queue consumer から呼ばれる想定。
 */
import dayjs from 'dayjs'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { getAppLogger } from '../logger'
import { type AniListEntry, fetchAnilistYearPage } from './anilist-fetch'
import { normalizeTitle } from './normalize'

const logger = getAppLogger('anilist-sync')

/** AniList の degrade rate limit (DDoS 対策で 30/min) を踏まえた最低間隔 */
const REQUEST_INTERVAL_MS = 1500

export interface SyncOptions {
  prisma: PrismaClient
  fromYear: number
  toYear: number
  country?: string
}

export interface SyncResult {
  fetched: number
  years: number
  elapsedMs: number
}

async function upsertEntry(
  prisma: PrismaClient,
  e: AniListEntry,
  country: string,
  syncedAt: Date
): Promise<void> {
  const data = {
    titleNative: e.title.native,
    titleRomaji: e.title.romaji,
    titleEnglish: e.title.english,
    season: e.season,
    seasonYear: e.seasonYear,
    status: e.status ?? 'UNKNOWN',
    startYear: e.startDate.year,
    startMonth: e.startDate.month,
    countryOfOrigin: country,
    nativeNorm: normalizeTitle(e.title.native) || null,
    romajiNorm: normalizeTitle(e.title.romaji) || null,
    englishNorm: normalizeTitle(e.title.english) || null,
    syncedAt
  }
  await prisma.anilistMedia.upsert({
    where: { id: e.id },
    create: { id: e.id, ...data },
    update: data
  })
}

/**
 * 指定範囲の年を AniList から fetch して anilist_media を upsert。
 * リクエスト間隔は REQUEST_INTERVAL_MS でレートリミット対応。
 */
export async function syncAnilistMedia(options: SyncOptions): Promise<SyncResult> {
  const { prisma, fromYear, toYear } = options
  const country = options.country ?? 'JP'
  const start = dayjs()
  let fetched = 0
  let yearsDone = 0

  logger.info({ action: 'sync-start', fromYear, toYear, country })

  for (const year of Array.from({ length: toYear - fromYear + 1 }, (_, i) => fromYear + i)) {
    const yearStart = fetched
    for (const page of Array.from({ length: 100 }, (_, i) => i + 1)) {
      await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS))
      const { hasNextPage, media } = await fetchAnilistYearPage(year, page, country)
      if (media.length === 0) break
      const syncedAt = dayjs().toDate()
      for (const e of media) {
        await upsertEntry(prisma, e, country, syncedAt)
      }
      fetched += media.length
      if (!hasNextPage) break
    }
    yearsDone += 1
    logger.info({ action: 'sync-year-done', year, delta: fetched - yearStart, total: fetched })
  }

  const elapsedMs = dayjs().diff(start, 'millisecond')
  logger.info({ action: 'sync-done', fetched, years: yearsDone, elapsedMs })
  return { fetched, years: yearsDone, elapsedMs }
}
