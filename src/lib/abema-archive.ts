import type { PrismaClient } from '../generated/prisma/client.ts'
import { getAppLogger } from './logger'

const logger = getAppLogger('abema-archive')

export interface AbemaArchiveRecord {
  programId: string
  cid: string
  contentKeyHex: string
  ivHex: string
  variantUrl: string
  variantResolution: string
  variantBandwidth: number
  segmentUrls: string[]
}

export interface AbemaArchiveItemResult {
  programId: string
  ok: boolean
  archive?: AbemaArchiveRecord
  error?: string
}

export interface AbemaArchiveResult {
  total: number
  archived: number
  failed: number
}

export type AbemaArchiveBatchFetcher = (programIds: string[]) => Promise<AbemaArchiveItemResult[]>

export async function archiveMissingAbemaKeysForAnime(
  prisma: PrismaClient,
  animeId: string,
  fetchArchives: AbemaArchiveBatchFetcher,
  batchSize = 5,
  // ABEMA / Lambda のレートリミットを避けるためチャンク間に挟むウェイト(ms)
  delayMs = 1000
): Promise<AbemaArchiveResult> {
  const episodes = await prisma.episode.findMany({
    where: { season: { animeId }, abemaKey: null },
    select: { id: true, episodeId: true }
  })
  if (episodes.length === 0) return { total: 0, archived: 0, failed: 0 }

  const safeBatchSize = Math.max(1, batchSize)
  const chunks = Array.from({ length: Math.ceil(episodes.length / safeBatchSize) }, (_, index) =>
    episodes.slice(index * safeBatchSize, (index + 1) * safeBatchSize)
  )
  const summary = await chunks.reduce(
    async (accPromise, chunk, index) => {
      const acc = await accPromise
      if (index > 0 && delayMs > 0) await new Promise((r) => setTimeout(r, delayMs))
      const results = await fetchArchives(chunk.map((episode) => episode.episodeId))
      const resultByProgramId = new Map(results.map((result) => [result.programId, result]))
      const chunkSummary = await chunk.reduce(
        async (chunkAccPromise, episode) => {
          const chunkAcc = await chunkAccPromise
          const result = resultByProgramId.get(episode.episodeId)
          if (!result) {
            logger.warn({
              action: 'abema-archive-episode-failed',
              animeId,
              episodeId: episode.episodeId,
              reason: 'missing lambda result'
            })
            return { archived: chunkAcc.archived, failed: chunkAcc.failed + 1 }
          }
          if (!result.ok || !result.archive) {
            logger.warn({
              action: 'abema-archive-episode-failed',
              animeId,
              episodeId: episode.episodeId,
              reason: result.error ?? 'unknown error'
            })
            return { archived: chunkAcc.archived, failed: chunkAcc.failed + 1 }
          }
          const archive = result.archive
          await prisma.abemaKeyArchive.upsert({
            where: { episodeId: episode.id },
            update: {
              programId: archive.programId,
              cid: archive.cid,
              contentKeyHex: archive.contentKeyHex,
              ivHex: archive.ivHex,
              variantUrl: archive.variantUrl,
              variantResolution: archive.variantResolution,
              variantBandwidth: archive.variantBandwidth,
              segmentUrls: JSON.stringify(archive.segmentUrls)
            },
            create: {
              episodeId: episode.id,
              programId: archive.programId,
              cid: archive.cid,
              contentKeyHex: archive.contentKeyHex,
              ivHex: archive.ivHex,
              variantUrl: archive.variantUrl,
              variantResolution: archive.variantResolution,
              variantBandwidth: archive.variantBandwidth,
              segmentUrls: JSON.stringify(archive.segmentUrls)
            }
          })
          return { archived: chunkAcc.archived + 1, failed: chunkAcc.failed }
        },
        Promise.resolve({ archived: 0, failed: 0 })
      )
      return { archived: acc.archived + chunkSummary.archived, failed: acc.failed + chunkSummary.failed }
    },
    Promise.resolve({ archived: 0, failed: 0 })
  )
  return { total: episodes.length, archived: summary.archived, failed: summary.failed }
}
