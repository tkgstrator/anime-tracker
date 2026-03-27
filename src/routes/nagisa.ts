import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { getAppLogger } from '../lib/logger'
import { NagisaStatusSchema } from '../schemas/nagisa.dto'

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
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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

export default nagisa
