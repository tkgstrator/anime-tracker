import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { type Message, MessageSchema } from '../schemas/message.dto'

type Bindings = {
  SYNC_QUEUE: Queue<Message>
}

const sync = new OpenAPIHono<{ Bindings: Bindings }>()

sync.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Sync'],
    summary: 'キューにSync メッセージを送信する',
    request: {
      body: {
        content: {
          'application/json': {
            schema: MessageSchema
          }
        }
      }
    },
    responses: {
      200: {
        description: 'メッセージをキューに送信した',
        content: {
          'application/json': {
            schema: z.object({ ok: z.boolean(), type: z.string() })
          }
        }
      }
    }
  }),
  async (c) => {
    const body = c.req.valid('json')
    await c.env.SYNC_QUEUE.send(body)
    return c.json({ ok: true, type: body.type })
  }
)

export default sync
