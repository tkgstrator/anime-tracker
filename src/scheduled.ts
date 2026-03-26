import { logger } from './lib/logger'
import type { Message } from './schemas/message.dto'

interface Env {
  SYNC_QUEUE: Queue<Message>
}

export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  const providers = ['hulu', 'amazon'] as const
  const hour = new Date(event.scheduledTime).getUTCHours()

  for (const provider of providers) {
    // 毎時: 新着エピソード取得
    await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'new_episode' } })
    logger.info({ context: 'scheduled', action: 'enqueue', provider, category: 'new_episode' })

    // 1日1回 (UTC 0時): 配信終了間近取得
    if (hour === 0) {
      await env.SYNC_QUEUE.send({ type: 'fetch', message: { provider, category: 'expiring' } })
      logger.info({ context: 'scheduled', action: 'enqueue', provider, category: 'expiring' })
    }
  }
}
