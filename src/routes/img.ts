import { OpenAPIHono } from '@hono/zod-openapi'
import { cache } from 'hono/cache'

type Bindings = { IMAGES: R2Bucket }

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.use('/:filename', cache({ cacheName: 'img-proxy', cacheControl: 'public, max-age=31536000, immutable' }))

app.get('/:filename', async (c) => {
  const filename = c.req.param('filename')

  const object = await c.env.IMAGES.get(filename)
  if (!object) return c.text('Not found', 404)

  return new Response(object.body, {
    headers: {
      'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
})

export default app
