import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { cache } from 'hono/cache'

const ALLOWED_HOSTS = new Set(['m.media-amazon.com', 'images.prod.hjholdings.tv'])

const CACHE_TTL = 60 * 60 * 24 * 7 // 7 days

const app = new OpenAPIHono()

const route = createRoute({
  method: 'get',
  path: '/',
  tags: ['Image'],
  summary: '外部画像プロキシ',
  request: {
    query: z.object({
      url: z.url().openapi({ description: '外部画像の URL', example: 'https://m.media-amazon.com/images/example.png' })
    })
  },
  responses: {
    200: { description: '画像データ' },
    400: { description: 'URL パラメータ不正' },
    403: { description: '許可されていないホスト' },
    502: { description: '外部サーバーエラー' }
  }
})

app.use('/', cache({ cacheName: 'img-proxy', cacheControl: `public, max-age=${CACHE_TTL}` }))

app.openapi(route, async (c) => {
  const { url } = c.req.valid('query')

  if (!ALLOWED_HOSTS.has(new URL(url).hostname)) {
    return c.text('Host not allowed', 403)
  }

  const res = await fetch(url)

  if (!res.ok) return c.text('Upstream error', 502)

  const contentType = res.headers.get('content-type') ?? 'application/octet-stream'
  return new Response(res.body, {
    headers: {
      'content-type': contentType,
      'cache-control': `public, max-age=${CACHE_TTL}`
    }
  })
})

export default app
