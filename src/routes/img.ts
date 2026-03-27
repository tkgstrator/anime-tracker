import { OpenAPIHono } from '@hono/zod-openapi'
import { cache } from 'hono/cache'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ALLOWED_EXT = new Set(['jpg', 'png', 'webp'])

const app = new OpenAPIHono()

app.use('/:filename', cache({ cacheName: 'img-proxy', cacheControl: 'public, max-age=31536000, immutable' }))

app.get('/:filename', async (c) => {
  const filename = c.req.param('filename')
  const dotIndex = filename.lastIndexOf('.')
  if (dotIndex === -1) return c.text('Bad request: missing extension', 400)

  const id = filename.slice(0, dotIndex)
  const ext = filename.slice(dotIndex + 1)
  if (!ALLOWED_EXT.has(ext)) return c.text('Bad request: invalid extension', 400)

  const query = c.req.query()
  const isHulu = UUID_RE.test(id)

  const url = isHulu ? buildHuluUrl(id, ext, query) : buildAmazonUrl(id, ext, query)

  const res = await fetch(url)
  if (!res.ok) return c.text('Upstream error', 502)

  return new Response(res.body, {
    headers: {
      'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
      'cache-control': 'public, max-age=31536000, immutable'
    }
  })
})

export function buildAmazonUrl(id: string, ext: string, query: Record<string, string>): string {
  const w = query.w
  const q = query.q
  const directives = [q ? `_QL${q}` : '', w ? `_SX${w}` : ''].filter(Boolean).join('')
  const suffix = directives ? `.${directives}_.${ext}` : `.${ext}`
  return `https://m.media-amazon.com/images/S/pv-target-images/${id}${suffix}`
}

export function buildHuluUrl(id: string, ext: string, query: Record<string, string>): string {
  const params = new URLSearchParams()
  if (query.w) params.set('w', query.w)
  if (query.h) params.set('h', query.h)
  if (query.q) params.set('q', query.q)
  if (query.p) params.set('p', query.p)
  const qs = params.toString()
  return `https://images.prod.hjholdings.tv/d3urerHm/uploads/${id}.${ext}${qs ? `?${qs}` : ''}`
}

export default app
