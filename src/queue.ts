import type { PrismaClient } from './generated/prisma/client.ts'
import { searchAniListChunk } from './lib/anilist'
import { createPrismaClient } from './lib/db'
import { checkNewEpisodes, syncEpisodesFromTmdb } from './lib/sync'

export type SyncMessage =
  | { type: 'check-new-episodes'; provider: string }
  | { type: 'sync-tmdb'; animeId: string; title: string; tmdbId: number | null }
  | { type: 'identify-anilist' }

interface Env {
  DB: D1Database
  TMDB_API_KEY: string
}

async function handleCheckNewEpisodes(prisma: PrismaClient, provider: string, apiKey: string): Promise<void> {
  const result = await checkNewEpisodes(prisma, provider, apiKey)
  console.log(
    `[queue:check-new-episodes] ${provider}: added=${result.added} updated=${result.updated} skipped=${result.skipped}`
  )
}

async function handleSyncTmdb(
  prisma: PrismaClient,
  animeId: string,
  title: string,
  tmdbId: number | null,
  apiKey: string
): Promise<void> {
  const result = await syncEpisodesFromTmdb(prisma, animeId, title, tmdbId, apiKey)
  console.log(`[queue:sync-tmdb] ${title}: seasons=${result.seasons} episodes=${result.episodes}`)
}

async function handleIdentifyAniList(prisma: PrismaClient): Promise<void> {
  const targets = await prisma.anime.findMany({
    where: {
      OR: [{ isIdentified: false }, { status: 'RELEASING' }]
    },
    select: { id: true, title: true, isIdentified: true }
  })

  if (targets.length === 0) return

  const CHUNK_SIZE = 50
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE)
    const results = await searchAniListChunk(
      chunk.map((a) => a.title),
      i
    )

    for (const [j, anime] of chunk.entries()) {
      const result = results[j]
      if (!result) continue

      const data: { title?: string; isIdentified?: boolean; status?: string; quarter?: number; year?: number } = {}

      if (!anime.isIdentified && result.nativeTitle) {
        data.title = result.nativeTitle.replace(/\u3000/g, ' ')
        data.isIdentified = true
      }

      if (result.status) {
        data.status = result.status
      }

      if (result.quarter != null) {
        data.quarter = result.quarter
      }

      if (result.year != null) {
        data.year = result.year
      }

      if (Object.keys(data).length > 0) {
        await prisma.anime.update({ where: { id: anime.id }, data })
      }
    }

    console.log(`[queue:identify-anilist] chunk ${i}–${i + chunk.length} / ${targets.length} done`)
  }
}

export async function queue(batch: MessageBatch<SyncMessage>, env: Env): Promise<void> {
  const prisma = createPrismaClient(env.DB)

  try {
    for (const msg of batch.messages) {
      try {
        switch (msg.body.type) {
          case 'check-new-episodes':
            await handleCheckNewEpisodes(prisma, msg.body.provider, env.TMDB_API_KEY)
            break
          case 'sync-tmdb':
            await handleSyncTmdb(prisma, msg.body.animeId, msg.body.title, msg.body.tmdbId, env.TMDB_API_KEY)
            break
          case 'identify-anilist':
            await handleIdentifyAniList(prisma)
            break
        }
        msg.ack()
      } catch (e) {
        console.error(`[queue] Failed to process ${msg.body.type}:`, e)
        msg.retry()
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}
