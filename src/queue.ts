import { createPrismaClient } from './lib/db'
import { getAppLogger } from './lib/logger'
import { SyncService } from './lib/sync'

import type { Message } from './schemas/message.dto'

const logger = getAppLogger('queue')

interface Env {
  DB: D1Database
  TMDB_API_KEY: string
  SYNC_QUEUE: Queue<Message>
  KV: KVNamespace
}

export async function queue(batch: MessageBatch<Message>, env: Env): Promise<void> {
  const prisma = createPrismaClient(env.DB)
  const service = new SyncService(prisma, env.KV)

  logger.info({ action: 'batch-start', batchSize: batch.messages.length, queue: batch.queue })

  try {
    for (const message of batch.messages) {
      logger.debug({ action: 'process-message', type: message.body.type, body: message.body.message })
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
            logger.info({ action: 'enqueue-updates', provider, category, count: contentIds.length })
            break
          }
          case 'update': {
            await service.update(message.body)
            logger.debug({
              action: 'update-done',
              provider: message.body.message.provider,
              contentId: message.body.message.contentId
            })
            break
          }
        }
        message.ack()
      } catch (e) {
        logger.error({
          action: 'process-error',
          type: message.body.type,
          body: message.body.message,
          error: e instanceof Error ? e.message : String(e)
        })
        message.retry()
      }
    }
  } finally {
    logger.debug({ action: 'batch-done', batchSize: batch.messages.length })
    await prisma.$disconnect()
  }
}
