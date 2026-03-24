import { logger } from './lib/logger'
import type { Message } from './schemas/message.dto'

interface Env {
  SYNC_QUEUE: Queue<Message>
}

export async function scheduled(_event: ScheduledEvent, env: Env): Promise<void> {
  const providers = ['hulu', 'amazon'] as const
  for (const provider of providers) {
    await env.SYNC_QUEUE.send({ type: 'update', message: { provider } })
    logger.info({ context: 'scheduled', action: 'enqueue', provider })
  }
}
