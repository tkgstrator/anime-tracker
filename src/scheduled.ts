import { logger } from './lib/logger'
import type { Message } from './schemas/message.dto'

interface Env {
  SYNC_QUEUE: Queue<Message>
}

export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const providers = ['hulu', 'amazon'] as const

  switch (event.cron) {
    case '0 */1 * * *':
      for (const provider of providers) {
        await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'new_episode' } })
        logger.info({ context: 'scheduled', action: 'enqueue', provider, category: 'new_episode' })
      }
      break
    case '0 0 * * *':
      for (const provider of providers) {
        await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'expiring' } })
        logger.info({ context: 'scheduled', action: 'enqueue', provider, category: 'expiring' })
      }
      break
    default:
      break
  }
}
