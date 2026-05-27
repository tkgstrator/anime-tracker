import { archiveMissingAbemaKeysForAnime } from './lib/abema-archive'
import { createPrismaClient } from './lib/db'
import { notifyError } from './lib/discord'
import { createFetchClient } from './lib/lambda'
import { getAppLogger } from './lib/logger'
import { syncAnilistMediaYear } from './lib/metadata/anilist-sync'
import { SyncService } from './lib/sync'

import type { Message } from './schemas/message.dto'

const logger = getAppLogger('queue')

interface Env {
  DB: D1Database
  TMDB_API_KEY: string
  SYNC_QUEUE: Queue<Message>
  KV: KVNamespace
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  LAMBDA_FUNCTION_URL: string
  LAMBDA_FUNCTION_URL_US: string
  DISCORD_WEBHOOK_URL: string
}

export async function queue(batch: MessageBatch<Message>, env: Env): Promise<void> {
  const prisma = createPrismaClient(env.DB)
  const lambda = createFetchClient(env)
  const service = new SyncService(prisma, lambda)

  logger.info({ action: 'batch-start', batchSize: batch.messages.length, queue: batch.queue })

  try {
    for (const message of batch.messages) {
      logger.debug({ action: 'process-message', type: message.body.type, body: message.body.message })
      try {
        switch (message.body.type) {
          case 'fetch': {
            const { provider, category } = message.body.message
            const contentIds = await service.fetch(message.body)
            if (category !== 'expiring' && category !== 'coming_soon') {
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
          case 'bulk_update': {
            const { provider, contentIds } = message.body.message
            for (const contentId of contentIds) {
              await env.SYNC_QUEUE.send({ type: 'update', message: { provider, contentId } })
            }
            logger.info({ action: 'bulk-enqueue', provider, count: contentIds.length })
            break
          }
          case 'anilist_sync': {
            const { year, country } = message.body.message
            const result = await syncAnilistMediaYear({ prisma, year, country })
            logger.info({
              action: 'anilist-sync-year-done',
              year,
              country,
              fetched: result.fetched,
              pages: result.pages,
              elapsedMs: result.elapsedMs
            })
            break
          }
          case 'abema_archive': {
            const { animeId } = message.body.message
            const result = await archiveMissingAbemaKeysForAnime(prisma, animeId, async (programIds) => {
              const result = await lambda.fetchAbemaArchives({ programIds })
              return result.results
            })
            if (result.total === 0) {
              logger.info({ action: 'abema-archive-skip', animeId, reason: 'all keys present' })
              break
            }
            logger.info({
              action: 'abema-archive-done',
              animeId,
              total: result.total,
              ok: result.archived,
              fail: result.failed
            })
            break
          }
        }
        message.ack()
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        logger.error({
          action: 'process-error',
          type: message.body.type,
          body: message.body.message,
          error: errorMessage
        })
        if (message.attempts >= 3) {
          await notifyError(env.DISCORD_WEBHOOK_URL, {
            title: 'Queue: 最終リトライ失敗',
            description: `\`\`\`\n${errorMessage}\n\`\`\``,
            fields: [
              { name: 'Type', value: message.body.type, inline: true },
              { name: 'Attempts', value: String(message.attempts), inline: true },
              { name: 'Detail', value: `\`\`\`json\n${JSON.stringify(message.body.message, null, 2)}\n\`\`\`` }
            ]
          })
        }
        message.retry()
      }
    }
  } finally {
    logger.debug({ action: 'batch-done', batchSize: batch.messages.length })
    await prisma.$disconnect()
  }
}
