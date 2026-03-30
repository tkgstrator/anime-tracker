import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { getAppLogger } from '../lib/logger'
import { RecordStatusWebhookSchema } from '../schemas/webhook.dto'

const logger = getAppLogger('webhooks')

type Bindings = { DB: D1Database }

const webhooks = new OpenAPIHono<{ Bindings: Bindings }>()

webhooks.openapi(
  createRoute({
    method: 'post',
    path: '/record-status',
    tags: ['Webhooks'],
    summary: 'Nagisa からのエピソード録画ステータス通知を受信',
    request: {
      body: {
        content: {
          'application/json': { schema: RecordStatusWebhookSchema }
        }
      }
    },
    responses: {
      200: {
        description: '受信成功',
        content: { 'application/json': { schema: z.object({ ok: z.boolean() }) } }
      },
      404: {
        description: 'エピソードが見つからない',
        content: { 'application/json': { schema: z.object({ error: z.string().nonempty() }) } }
      },
      422: {
        description: 'バリデーションエラー',
        content: { 'application/json': { schema: z.object({ error: z.unknown() }) } }
      }
    }
  }),
  async (c) => {
    const body = c.req.valid('json')
    const { provider, content_id, episode_id, status } = body

    logger.info({ action: 'record-status', provider, contentId: content_id, episodeId: episode_id, status })

    const prisma = createPrismaClient(c.env.DB)

    // episode_id が null の場合はコンテンツレベルのエラー (CONTENT_NOT_FOUND 等)
    if (episode_id === null) {
      if (status === 'failed' && body.error) {
        logger.warn({
          action: 'content-level-error',
          provider,
          contentId: content_id,
          errorStatus: body.error.status,
          errorMessage: body.error.message
        })
      }
      return c.json({ ok: true }, 200)
    }

    // エピソードを検索
    const episode = await prisma.episode.findFirst({
      where: {
        episodeId: episode_id,
        season: { anime: { provider, contentId: content_id } }
      },
      select: { id: true, recorded: true }
    })

    if (!episode) {
      logger.warn({ action: 'episode-not-found', provider, contentId: content_id, episodeId: episode_id })
      return c.json({ error: `Episode not found: ${episode_id}` }, 404)
    }

    // completed → recorded = true
    if (status === 'completed' && !episode.recorded) {
      await prisma.episode.update({
        where: { id: episode.id },
        data: { recorded: true }
      })
      logger.info({ action: 'episode-recorded', episodeId: episode_id })
    }

    // failed → エラーログ
    if (status === 'failed' && body.error) {
      logger.warn({
        action: 'episode-failed',
        provider,
        contentId: content_id,
        episodeId: episode_id,
        errorStatus: body.error.status,
        errorMessage: body.error.message
      })
    }

    return c.json({ ok: true }, 200)
  }
)

export default webhooks
