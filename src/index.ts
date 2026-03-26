import { OpenAPIHono } from '@hono/zod-openapi'
import { honoLogger } from '@logtape/hono'
import { apiReference } from '@scalar/hono-api-reference'
import { createPrismaClient } from './lib/db'
import { setupLogger, startCapture, stopCapture } from './lib/logger'
import { SyncService } from './lib/sync'
import { queue } from './queue'
import animeRoutes from './routes/anime'
import recordingsRoutes from './routes/recordings'
import webhooksRoutes from './routes/webhooks'
import { scheduled } from './scheduled'
import { MessageSchema } from './schemas/message.dto'

type Bindings = { DB: D1Database; TMDB_API_KEY: string; SYNC_QUEUE: Queue; KV: KVNamespace }

setupLogger()

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.use(honoLogger({ category: ['app', 'hono'] }))

app.route('/api/anime', animeRoutes)
app.route('/api/recordings', recordingsRoutes)
app.route('/api/webhooks', webhooksRoutes)

// キューを経由せず SyncService を直接実行する
app.post('/api/queues', async (c) => {
  const body = MessageSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: body.error.flatten() }, 400)
  const prisma = createPrismaClient(c.env.DB)
  const service = new SyncService(prisma, c.env.KV)
  startCapture()
  try {
    if (body.data.type === 'fetch') {
      const contentIds = await service.fetch(body.data)
      const { provider, category } = body.data.message
      if (category !== 'expiring') {
        for (const contentId of contentIds) {
          await service.update({ type: 'update', message: { provider, contentId } })
        }
      }
      return c.json({ type: 'fetch', category, contentIds, logs: stopCapture() })
    }
    await service.update(body.data)
    return c.json({ type: 'update', success: true, logs: stopCapture() })
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : String(e), logs: stopCapture() }, 500)
  } finally {
    await prisma.$disconnect()
  }
})

// デバッグ用: Falcor API / AniList のレスポンスを直接確認する
app.get('/api/debug/falcor/:slug', async (c) => {
  const slug = c.req.param('slug')
  const paths = JSON.stringify([['titleSlug', slug, ['name', 'slug', 'description', 'thumbnailUrl', 'service']]])
  const url = `https://www.hulu.jp/anon/ja/webp/path?paths=${encodeURIComponent(paths)}&method=get`
  const res = await fetch(url)
  return c.json({ status: res.status, body: await res.json() })
})

app.get('/api/debug/anilist/:title', async (c) => {
  const title = c.req.param('title')
  const query = `query { Page(perPage: 5) { media(search: ${JSON.stringify(title)}, type: ANIME) { id title { native } countryOfOrigin status season seasonYear } } }`
  const res = await fetch('https://graphql.anilist.co', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  })
  return c.json({ status: res.status, body: await res.json() })
})

app.doc('/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'AnimeTracker API',
    version: '1.0.0'
  }
})

app.get(
  '/docs',
  apiReference({
    url: '/openapi.json',
    pageTitle: 'AnimeTracker API Reference'
  })
)

export default {
  fetch: app.fetch,
  scheduled,
  queue
}
