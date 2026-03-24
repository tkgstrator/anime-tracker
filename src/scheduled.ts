import { createPrismaClient } from './lib/db'
import type { SyncMessage } from './queue'

interface Env {
  DB: D1Database
  TMDB_API_KEY: string
  SYNC_QUEUE: Queue<SyncMessage>
}

export async function scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  const prisma = createPrismaClient(env.DB)

  try {
    // 1. プロバイダごとの新エピソードチェックをキューに投入
    const providers = ['hulu', 'amazon']
    for (const provider of providers) {
      await env.SYNC_QUEUE.send({ type: 'check-new-episodes', provider })
      console.log(`[scheduled] Enqueued check-new-episodes for ${provider}`)
    }

    // 2. 各アニメのTMDB同期をキューに投入
    const animeList = await prisma.anime.findMany({
      select: { id: true, title: true, tmdbId: true }
    })

    const messages: MessageSendRequest<SyncMessage>[] = animeList.map((a) => ({
      body: { type: 'sync-tmdb' as const, animeId: a.id, title: a.title, tmdbId: a.tmdbId }
    }))

    for (let i = 0; i < messages.length; i += 100) {
      await env.SYNC_QUEUE.sendBatch(messages.slice(i, i + 100))
    }
    console.log(`[scheduled] Enqueued ${animeList.length} sync-tmdb jobs`)

    // 3. AniList識別をキューに投入
    await env.SYNC_QUEUE.send({ type: 'identify-anilist' })
    console.log('[scheduled] Enqueued identify-anilist')
  } finally {
    await prisma.$disconnect()
  }
}
