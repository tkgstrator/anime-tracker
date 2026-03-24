import type { PrismaClient } from './generated/prisma/client.ts'
import { searchAniListChunk } from './lib/anilist'
import { createPrismaClient } from './lib/db'
import { checkNewEpisodes, syncEpisodesFromTmdb } from './lib/sync'

interface Env {
  DB: D1Database
  TMDB_API_KEY: string
}

async function identifyTitles(prisma: PrismaClient): Promise<void> {
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

    console.log(`[identify] chunk ${i}–${i + chunk.length} / ${targets.length} done`)
  }
}

export async function scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
  const prisma = createPrismaClient(env.DB)

  ctx.waitUntil(
    (async () => {
      try {
        // 1. プロバイダから新エピソードをチェックしてDBに追加/更新
        const providerNames = ['hulu', 'amazon']
        for (const name of providerNames) {
          try {
            const result = await checkNewEpisodes(prisma, name, env.TMDB_API_KEY)
            console.log(
              `[scheduled] ${name}: added=${result.added} updated=${result.updated} skipped=${result.skipped}`
            )
          } catch (e) {
            console.error(`[scheduled] ${name} checkNewEpisodes failed:`, e)
          }
        }

        // 2. TMDB からエピソード情報を同期
        const animeList = await prisma.anime.findMany({
          select: { id: true, title: true, tmdbId: true }
        })

        const results = await Promise.allSettled(
          animeList.map((a) => syncEpisodesFromTmdb(prisma, a.id, a.title, a.tmdbId, env.TMDB_API_KEY))
        )

        for (const r of results) {
          if (r.status === 'rejected') {
            console.error('scheduled sync failed:', r.reason)
          }
        }

        // 3. 未識別タイトルを AniList で識別
        await identifyTitles(prisma)
      } finally {
        await prisma.$disconnect()
      }
    })()
  )
}
