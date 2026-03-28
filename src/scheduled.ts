import { getAppLogger } from './lib/logger'
import type { Message } from './schemas/message.dto'

const logger = getAppLogger('scheduled')

interface Env {
  SYNC_QUEUE: Queue<Message>
}

export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const providers = ['hulu', 'amazon'] as const

  logger.debug({ action: 'trigger', cron: event.cron, scheduledTime: new Date(event.scheduledTime).toISOString() })

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
    default:
      logger.warn({ action: 'unknown-cron', cron: event.cron })
      break
  }
}
