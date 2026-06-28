import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getAppLogger } from '../lib/logger'
import { NagisaEnqueueRequestSchema, NagisaEnqueueResponseSchema, NagisaStatusSchema } from '../schemas/nagisa.dto'

const logger = getAppLogger('routes')

type Bindings = {
  BACKEND_URL: string
  CF_ACCESS_CLIENT_ID: string
  CF_ACCESS_CLIENT_SECRET: string
}

const nagisa = new OpenAPIHono<{ Bindings: Bindings }>()

nagisa.openapi(
  createRoute({
    method: 'get',
    path: '/status',
    tags: ['Nagisa'],
    summary: 'Nagisaサーバーのステータスを取得',
    responses: {
      200: {
        description: 'Nagisaステータス',
        content: { 'application/json': { schema: NagisaStatusSchema } }
      },
      502: {
        description: 'Nagisaサーバーに接続できない',
        content: { 'application/json': { schema: z.object({ error: z.string().nonempty() }) } }
      }
    }
  }),
  async (c) => {
    try {
      const res = await fetch(`${c.env.BACKEND_URL}/api/status`, {
        headers: {
          'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
          'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET
        }
      })
      if (!res.ok) {
        logger.error({ action: 'nagisa-status-error', status: res.status, body: await res.text() })
        return c.json({ error: `Nagisa returned ${res.status}` }, 502 as const)
      }
      const data = await res.json()
      return c.json(data as z.infer<typeof NagisaStatusSchema>, 200)
    } catch (e) {
      logger.error({ action: 'nagisa-status-fetch-error', error: e instanceof Error ? e.message : String(e) })
      return c.json({ error: 'Failed to connect to Nagisa' }, 502 as const)
    }
  }
)

nagisa.openapi(
  createRoute({
    method: 'post',
    path: '/jobs',
    tags: ['Nagisa'],
    summary: 'Nagisa の /api/queues へ単体ジョブを直接投入する (CF Access はサーバ側で付与)',
    request: {
      body: {
        content: {
          'application/json': { schema: NagisaEnqueueRequestSchema }
        }
      }
    },
    responses: {
      200: {
        description: '投入されたジョブ',
        content: { 'application/json': { schema: NagisaEnqueueResponseSchema } }
      },
      502: {
        description: 'Nagisa サーバーが受け付けなかった',
        content: {
          'application/json': {
            schema: z.object({ error: z.string().nonempty(), status: z.number().int().optional() })
          }
        }
      }
    }
  }),
  async (c) => {
    const body = c.req.valid('json')
    try {
      const res = await fetch(`${c.env.BACKEND_URL}/api/queues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
          'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET
        },
        body: JSON.stringify(body)
      })
      if (!res.ok) {
        const text = await res.text()
        logger.error({ action: 'nagisa-enqueue-error', status: res.status, body: text })
        return c.json({ error: text || `Nagisa returned ${res.status}`, status: res.status }, 502 as const)
      }
      const data = await res.json()
      logger.info({
        action: 'nagisa-enqueue-sent',
        provider: body.provider,
        items: body.items.map((i) => i.content_id)
      })
      return c.json(data as z.infer<typeof NagisaEnqueueResponseSchema>, 200)
    } catch (e) {
      logger.error({ action: 'nagisa-enqueue-fetch-error', error: e instanceof Error ? e.message : String(e) })
      return c.json({ error: 'Failed to connect to Nagisa' }, 502 as const)
    }
  }
)

export default nagisa
