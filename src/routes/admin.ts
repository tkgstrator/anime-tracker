import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { getAppLogger } from '../lib/logger'
import type { Message } from '../schemas/message.dto'

const logger = getAppLogger('routes')

type Bindings = {
  DB: D1Database
  SYNC_QUEUE: Queue<Message>
}

const EnqueueResponseSchema = z.object({
  enqueued: z.number().int().min(0)
})

const admin = new OpenAPIHono<{ Bindings: Bindings }>()

admin.openapi(
  createRoute({
    method: 'post',
    path: '/abema/enqueue-archive',
    tags: ['Admin'],
    summary: '鍵未取得の ABEMA anime をすべて archive キューに投入する (cron を待たない手動キック)',
    responses: {
      200: {
        description: 'キュー投入結果',
        content: { 'application/json': { schema: EnqueueResponseSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    try {
      const animes = await prisma.anime.findMany({
        where: {
          provider: 'abema',
          seasons: { some: { episodes: { some: { abemaKey: null } } } }
        },
        select: { id: true }
      })
      for (const anime of animes) {
        await c.env.SYNC_QUEUE.send({ type: 'abema_archive', message: { animeId: anime.id } })
      }
      logger.info({ action: 'enqueue-abema-archive', count: animes.length })
      return c.json({ enqueued: animes.length }, 200)
    } finally {
      await prisma.$disconnect()
    }
  }
)

export default admin
