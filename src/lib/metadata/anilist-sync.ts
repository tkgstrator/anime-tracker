/**
 * AniList anime media を 1 年単位で fetch して D1 の anilist_media を Prisma 経由で upsert する。
 * Workers Queue consumer から年単位のメッセージで呼ばれる想定。
 */
import dayjs from 'dayjs'
import type { PrismaClient } from '../../generated/prisma/client.ts'
import { getAppLogger } from '../logger'
import { type AniListEntry, fetchAnilistYearPage } from './anilist-fetch'
import { normalizeTitle } from './normalize'

const logger = getAppLogger('anilist-sync')

/** AniList の degrade rate limit (DDoS 対策で 30/min) を踏まえた最低間隔 */
const REQUEST_INTERVAL_MS = 1500

export interface SyncYearOptions {
  prisma: PrismaClient
  year: number
  country?: string
}

export interface SyncYearResult {
  year: number
  fetched: number
  pages: number
  elapsedMs: number
}

async function upsertEntry(prisma: PrismaClient, e: AniListEntry, country: string, syncedAt: Date): Promise<void> {
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
 * 指定年の AniList anime を fetch して anilist_media を upsert する。
 * Queue 1 メッセージ = 1 年。失敗時は Queue の retry に任せて再実行される（idempotent）。
 */
export async function syncAnilistMediaYear(options: SyncYearOptions): Promise<SyncYearResult> {
  const { prisma, year } = options
  const country = options.country ?? 'JP'
  const start = dayjs()
  let fetched = 0
  let pages = 0

  logger.info({ action: 'sync-year-start', year, country })

  for (const page of Array.from({ length: 100 }, (_, i) => i + 1)) {
    await new Promise((r) => setTimeout(r, REQUEST_INTERVAL_MS))
    const { hasNextPage, media } = await fetchAnilistYearPage(year, page, country)
    if (media.length === 0) break
    const syncedAt = dayjs().toDate()
    for (const e of media) {
      await upsertEntry(prisma, e, country, syncedAt)
    }
    fetched += media.length
    pages += 1
    if (!hasNextPage) break
  }

  const elapsedMs = dayjs().diff(start, 'millisecond')
  logger.info({ action: 'sync-year-done', year, country, fetched, pages, elapsedMs })
  return { year, fetched, pages, elapsedMs }
}
