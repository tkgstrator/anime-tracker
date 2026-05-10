import { createPrismaClient } from './lib/db'
import { notifyError } from './lib/discord'
import { getAppLogger } from './lib/logger'
import type { Message } from './schemas/message.dto'

const logger = getAppLogger('scheduled')

interface Env {
  DB: D1Database
  SYNC_QUEUE: Queue<Message>
  DISCORD_WEBHOOK_URL: string
}

async function enqueueAbemaArchive(env: Env): Promise<number> {
  const prisma = createPrismaClient(env.DB)
  try {
    const animes = await prisma.anime.findMany({
      where: {
        provider: 'abema',
        seasons: { some: { episodes: { some: { abemaKey: null } } } }
      },
      select: { id: true }
    })
    for (const anime of animes) {
      await env.SYNC_QUEUE.send({ type: 'abema_archive', message: { animeId: anime.id } })
    }
    return animes.length
  } finally {
    await prisma.$disconnect()
  }
}

export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const providers = ['hulu', 'amazon', 'crunchyroll', 'abema'] as const

  logger.debug({ action: 'trigger', cron: event.cron, scheduledTime: new Date(event.scheduledTime).toISOString() })

  try {
    switch (event.cron) {
      case '0 */1 * * *':
        for (const provider of providers) {
          for (const category of ['new_episode', 'coming_soon'] as const) {
            await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category } })
            logger.info({ action: 'enqueue', provider, category })
          }
        }
        break
      case '0 0 * * *':
        for (const provider of providers) {
          await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'expiring' } })
          logger.info({ action: 'enqueue', provider, category: 'expiring' })
        }
        break
      case '0 3 * * *':
        for (const provider of providers) {
          await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'catalog' } })
          logger.info({ action: 'enqueue', provider, category: 'catalog' })
        }
        break
      case '0 4 * * *': {
        const count = await enqueueAbemaArchive(env)
        logger.info({ action: 'enqueue-abema-archive', count })
        break
      }
      default:
        logger.warn({ action: 'unknown-cron', cron: event.cron })
        break
    }
  } catch (e) {
    const errorMessage = e instanceof Error ? e.message : String(e)
    logger.error({ action: 'scheduled-error', cron: event.cron, error: errorMessage })
    await notifyError(env.DISCORD_WEBHOOK_URL, {
      title: 'Scheduled: キュー投入失敗',
      description: errorMessage,
      fields: [{ name: 'Cron', value: event.cron, inline: true }]
    })
  }
}
