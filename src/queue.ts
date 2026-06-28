import { archiveMissingAbemaKeysForAnime } from './lib/abema-archive'
import { createPrismaClient } from './lib/db'
import { COLOR_SUCCESS, COLOR_WARN, notify } from './lib/discord'
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

/** 失敗通知に載せるため、メッセージ対象のアニメ（識別済みなら）を引く */
async function findAnimeForMessage(
  prisma: ReturnType<typeof createPrismaClient>,
  body: Message
): Promise<{ title: string; imageUrl: string } | null> {
  if (body.type === 'update') {
    return prisma.anime.findUnique({
      where: { provider_contentId: { provider: body.message.provider, contentId: body.message.contentId } },
      select: { title: true, imageUrl: true }
    })
  }
  if (body.type === 'abema_archive') {
    return prisma.anime.findUnique({
      where: { id: body.message.animeId },
      select: { title: true, imageUrl: true }
    })
  }
  return null
}

/** Discord embed field value は 1024 文字まで。超えたら "...他N件" で切り詰める */
function truncateForFieldValue(lines: string[]): string {
  const MAX = 1024
  const SUFFIX_TEMPLATE = (rest: number) => `\n…他 ${rest} 件`
  const collected: string[] = []
  let used = 0
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const next = used === 0 ? line.length : used + 1 + line.length
    const remaining = lines.length - i
    const suffix = SUFFIX_TEMPLATE(remaining)
    if (next + suffix.length > MAX && i < lines.length - 1) {
      return `${collected.join('\n')}${SUFFIX_TEMPLATE(remaining)}`
    }
    if (next > MAX) {
      return collected.join('\n')
    }
    collected.push(line)
    used = next
  }
  return collected.join('\n')
}

export async function queue(batch: MessageBatch<Message>, env: Env): Promise<void> {
  const prisma = createPrismaClient(env.DB)
  const lambda = createFetchClient(env)
  const service = new SyncService(prisma, lambda)

  logger.info({ action: 'batch-start', batchSize: batch.messages.length, queue: batch.queue })

  let succeeded = 0
  let failed = 0
  const failedLabels: string[] = []

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
        succeeded++
      } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e)
        logger.error({
          action: 'process-error',
          type: message.body.type,
          body: message.body.message,
          error: errorMessage
        })
        if (message.attempts >= 3) {
          failed++
          const anime = await findAnimeForMessage(prisma, message.body).catch(() => null)
          failedLabels.push(anime ? anime.title : `[${message.body.type}]`)
        }
        message.retry()
      }
    }

    if (succeeded > 0 || failed > 0) {
      const fields: { name: string; value: string; inline?: boolean }[] = []
      if (failedLabels.length > 0) {
        fields.push({ name: '失敗一覧', value: truncateForFieldValue(failedLabels) })
      }
      await notify(env.DISCORD_WEBHOOK_URL, {
        title: 'Queue: バッチ完了',
        description: failed > 0 ? `成功 ${succeeded} 件 / 失敗 ${failed} 件` : `${succeeded} 件 正常に完了しました`,
        color: failed > 0 ? COLOR_WARN : COLOR_SUCCESS,
        fields
      })
    }
  } finally {
    logger.debug({ action: 'batch-done', batchSize: batch.messages.length })
    await prisma.$disconnect()
  }
}
