import { OpenAPIHono } from '@hono/zod-openapi'
import { cache } from 'hono/cache'

type Bindings = { IMAGES: R2Bucket }

const app = new OpenAPIHono<{ Bindings: Bindings }>()

// TODO: R2 移行完了後に UUIDv5 ベースに戻す
// app.use('/:filename', cache({ cacheName: 'img-proxy', cacheControl: 'public, max-age=31536000, immutable' }))
//
// app.get('/:filename', async (c) => {
//   const filename = c.req.param('filename')
//   const object = await c.env.IMAGES.get(filename)
//   if (!object) return c.text('Not found', 404)
//   return new Response(object.body, {
//     headers: {
//       'content-type': object.httpMetadata?.contentType ?? 'image/jpeg',
//       'cache-control': 'public, max-age=31536000, immutable'
//     }
//   })
// })

app.use('/:key', cache({ cacheName: 'img-proxy', cacheControl: 'public, max-age=86400' }))

app.get('/:key', async (c) => {
  const key = c.req.param('key')
  const url = atob(key)

  const res = await fetch(url)
  if (!res.ok) return c.text('Upstream error', 502)

  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'image/jpeg',
      'cache-control': 'public, max-age=86400'
    }
  })
})

export default app
