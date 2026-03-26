import { createPrismaClient } from './lib/db'
import { logger } from './lib/logger'
import { SyncService } from './lib/sync'

import type { Message } from './schemas/message.dto'

interface Env {
  DB: D1Database
  TMDB_API_KEY: string
  SYNC_QUEUE: Queue<Message>
  KV: KVNamespace
}

export async function queue(batch: MessageBatch<Message>, env: Env): Promise<void> {
  const prisma = createPrismaClient(env.DB)
  const service = new SyncService(prisma, env.KV)

  try {
    for (const message of batch.messages) {
      try {
        switch (message.body.type) {
          case 'fetch': {
            const contentIds = await service.fetch(message.body)
            const { provider, category } = message.body.message
            if (category !== 'expiring') {
              for (const contentId of contentIds) {
                await env.SYNC_QUEUE.send({ type: 'update', message: { provider, contentId } })
              }
            }
            logger.info({ context: 'queue', action: 'enqueue-updates', provider, category, count: contentIds.length })
            break
          }
          case 'update': {
            await service.update(message.body)
            break
          }
        }
        message.ack()
      } catch (e) {
        logger.error({ context: 'queue', type: message.body.type, error: e instanceof Error ? e.message : String(e) })
        message.retry()
      }
    }
  } finally {
    await prisma.$disconnect()
  }
}
