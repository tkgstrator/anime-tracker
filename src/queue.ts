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
  const buildSuffix = (rest: number) => `\n…他 ${rest} 件`
  const joinedLength = (xs: string[]) => (xs.length === 0 ? 0 : xs.reduce((acc, s) => acc + s.length + 1, -1))

  const collected: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const tentative = [...collected, line]
    const tentativeLen = joinedLength(tentative)
    // 全行入り切る場合は suffix 不要
    if (i === lines.length - 1 && tentativeLen <= MAX) {
      return tentative.join('\n')
    }
    // 行を足しても本文だけで 1024 以内なら確定して次へ
    if (tentativeLen <= MAX) {
      collected.push(line)
      continue
    }
    // ここで切り詰め確定。suffix が入る余地を作るため collected を後ろから削る
    const remaining = lines.length - i
    const suffix = buildSuffix(remaining)
    while (collected.length > 0 && joinedLength(collected) + suffix.length > MAX) {
      collected.pop()
    }
    return `${collected.join('\n')}${suffix}`
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
      const body = message.body
      const meta: Record<string, unknown> = { action: 'process-message', type: body.type }
      if (body.type === 'fetch') {
        meta.provider = body.message.provider
        meta.category = body.message.category
      } else if (body.type === 'update') {
        meta.provider = body.message.provider
        meta.contentId = body.message.contentId
      } else if (body.type === 'bulk_update') {
        meta.provider = body.message.provider
        meta.count = body.message.contentIds.length
      } else if (body.type === 'abema_archive') {
        meta.animeId = body.message.animeId
      } else if (body.type === 'anilist_sync') {
        meta.year = body.message.year
      }
      logger.debug(meta as { action: string })
      try {
        switch (message.body.type) {
          case 'fetch': {
            const { provider, category } = message.body.message
            const contentIds = await service.fetch(message.body)
            if (category !== 'expiring' && category !== 'coming_soon') {
              const BULK_SIZE = 25
              for (let i = 0; i < contentIds.length; i += BULK_SIZE) {
                const chunk = contentIds.slice(i, i + BULK_SIZE)
                await env.SYNC_QUEUE.send({ type: 'bulk_update', message: { provider, contentIds: chunk } })
              }
            }
            logger.info({ action: 'enqueue-updates', provider, category, count: contentIds.length })
            break
          }
          case 'update': {
            await service.update(message.body)
            break
          }
          case 'bulk_update': {
            const { provider, contentIds } = message.body.message
            const CONCURRENT = 5
            const DELAY_MS = 3000
            for (let i = 0; i < contentIds.length; i += CONCURRENT) {
              const chunk = contentIds.slice(i, i + CONCURRENT)
              await Promise.all(
                chunk.map((contentId) => service.update({ type: 'update', message: { provider, contentId } }))
              )
              if (i + CONCURRENT < contentIds.length) {
                await new Promise<void>((resolve) => setTimeout(resolve, DELAY_MS))
              }
            }
            logger.info({ action: 'bulk-update-done', provider, count: contentIds.length })
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
