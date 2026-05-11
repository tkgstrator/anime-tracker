import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { createFetchClient } from '../lib/lambda'
import { localDetailFetchers } from '../lib/local-detail-fetchers'
import { startCapture, stopCapture } from '../lib/logger'
import { SyncService } from '../lib/sync'
import { MessageSchema } from '../schemas/message.dto'

type Bindings = {
  DB: D1Database
  TMDB_API_KEY: string
  KV: KVNamespace
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  LAMBDA_FUNCTION_URL: string
  LAMBDA_FUNCTION_URL_US: string
}

const LogsSchema = z.array(z.record(z.string(), z.unknown()))

const FetchResultSchema = z.object({
  type: z.literal('fetch'),
  category: z.string().nonempty(),
  contentIds: z.array(z.string().nonempty()),
  logs: LogsSchema
})

const BulkUpdateResultSchema = z.object({
  type: z.literal('bulk_update'),
  count: z.number().int().min(0),
  results: z.array(
    z.object({
      contentId: z.string().nonempty(),
      status: z.enum(['ok', 'error']),
      error: z.string().optional()
    })
  ),
  logs: LogsSchema
})

const UpdateResultSchema = z.object({
  type: z.literal('update'),
  success: z.boolean(),
  logs: LogsSchema
})

const QueuesResponseSchema = z.discriminatedUnion('type', [
  FetchResultSchema,
  BulkUpdateResultSchema,
  UpdateResultSchema
])

const QueuesErrorSchema = z.object({
  error: z.string().nonempty(),
  logs: LogsSchema.optional()
})

const queues = new OpenAPIHono<{ Bindings: Bindings }>()

queues.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Queue'],
    summary: 'Queue を経由せず SyncService を直接実行する (デバッグ/手動同期用)',
    request: {
      body: {
        content: {
          'application/json': { schema: MessageSchema }
        }
      }
    },
    responses: {
      200: {
        description: '実行結果',
        content: { 'application/json': { schema: QueuesResponseSchema } }
      },
      400: {
        description: '不正なメッセージ型',
        content: { 'application/json': { schema: QueuesErrorSchema } }
      },
      500: {
        description: '実行中のエラー',
        content: { 'application/json': { schema: QueuesErrorSchema } }
      }
    }
  }),
  async (c) => {
    const body = c.req.valid('json')
    const prisma = createPrismaClient(c.env.DB)
    const lambda = createFetchClient(c.env)
    const service = new SyncService(prisma, lambda)
    startCapture()
    try {
      if (body.type === 'fetch') {
        const { provider, category } = body.message
        const contentIds = await service.fetch(body)
        if (category !== 'expiring' && category !== 'coming_soon') {
          for (const contentId of contentIds) {
            await service.update({ type: 'update', message: { provider, contentId } })
          }
        }
        return c.json({ type: 'fetch' as const, category, contentIds, logs: stopCapture() }, 200)
      }
      if (body.type === 'bulk_update') {
        const { provider, contentIds } = body.message
        const fetcher = localDetailFetchers[provider]
        const results: { contentId: string; status: 'ok' | 'error'; error?: string }[] = []
        for (const contentId of contentIds) {
          try {
            if (fetcher) {
              const detail = await fetcher(contentId)
              await service.applyDetail(provider, contentId, detail)
            } else {
              await service.update({ type: 'update', message: { provider, contentId } })
            }
            results.push({ contentId, status: 'ok' })
          } catch (e) {
            results.push({ contentId, status: 'error', error: e instanceof Error ? e.message : String(e) })
          }
        }
        return c.json({ type: 'bulk_update' as const, count: contentIds.length, results, logs: stopCapture() }, 200)
      }
      if (body.type === 'abema_archive') {
        return c.json(
          {
            error: 'abema_archive is not executable via /api/queues, use /api/admin/abema/enqueue-archive',
            logs: stopCapture()
          },
          400
        )
      }
      if (body.type === 'anilist_sync') {
        return c.json(
          {
            error: 'anilist_sync is heavy (~10min) and should be triggered via cron only',
            logs: stopCapture()
          },
          400
        )
      }
      await service.update(body)
      return c.json({ type: 'update' as const, success: true, logs: stopCapture() }, 200)
    } catch (e) {
      return c.json({ error: e instanceof Error ? e.message : String(e), logs: stopCapture() }, 500)
    } finally {
      await prisma.$disconnect()
    }
  }
)

export default queues
