import { OpenAPIHono } from '@hono/zod-openapi'
import { cache } from 'hono/cache'
import { optimizeImage } from 'wasm-image-optimization/workerd'

const app = new OpenAPIHono()

app.use('/:key{.+}', cache({ cacheName: 'img-proxy', cacheControl: 'public, max-age=31536000, immutable' }))

app.get('/:key{.+}', async (c) => {
  const raw = c.req.param('key')
  const key = raw.replace(/-/g, '+').replace(/_/g, '/')
  const padded = key + '==='.slice(0, (4 - (key.length % 4)) % 4)
  const url = atob(padded)

  const wParam = c.req.query('w')
  const wParsed = wParam ? Number.parseInt(wParam, 10) : undefined
  const width = wParsed && Number.isFinite(wParsed) && wParsed >= 1 ? Math.min(wParsed, 4096) : undefined

  const res = await fetch(url)
  if (!res.ok) return c.text('Upstream error', 502)

  const contentType = res.headers.get('content-type') ?? ''
  if (!contentType.startsWith('image/')) return c.text('Not an image', 502)

  const image = await res.arrayBuffer()

  let result: Awaited<ReturnType<typeof optimizeImage>>
  try {
    result = await optimizeImage({ image, format: 'webp', width, quality: 80 })
  } catch {
    return c.text('Optimization failed', 500)
  }

  return new Response(result.data.buffer as ArrayBuffer, {
    headers: {
      'content-type': 'image/webp',
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
})

export default app
