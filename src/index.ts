import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import { logger } from 'hono/logger'
import { createPrismaClient } from './lib/db'
import { createFetchClient } from './lib/lambda'
import { setupLogger, startCapture, stopCapture } from './lib/logger'
import { SyncService } from './lib/sync'
import { queue } from './queue'
import animeRoutes from './routes/anime'
import imgRoutes from './routes/img'
import nagisaRoutes from './routes/nagisa'
import recordingsRoutes from './routes/recordings'
import webhooksRoutes from './routes/webhooks'
import { scheduled } from './scheduled'
import { MessageSchema } from './schemas/message.dto'

type Bindings = {
  DB: D1Database
  ASSETS: Fetcher
  TMDB_API_KEY: string
  SYNC_QUEUE: Queue
  KV: KVNamespace
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  LAMBDA_FUNCTION_URL: string
  LAMBDA_FUNCTION_URL_US: string
}

setupLogger()

const app = new OpenAPIHono<{ Bindings: Bindings }>()

// app.use(honoLogger({ category: ['app', 'hono'] }))
app.use(logger())

app.route('/api/anime', animeRoutes)
app.route('/api/img', imgRoutes)
app.route('/api/nagisa', nagisaRoutes)
app.route('/api/recordings', recordingsRoutes)
app.route('/api/webhooks', webhooksRoutes)

// キューを経由せず SyncService を直接実行する
app.post('/api/queues', async (c) => {
  const body = MessageSchema.safeParse(await c.req.json())
  if (!body.success) return c.json({ error: body.error.flatten() }, 400)
  const prisma = createPrismaClient(c.env.DB)
  const lambda = createFetchClient(c.env)
  const service = new SyncService(prisma, lambda)
  startCapture()
  try {
    if (body.data.type === 'fetch') {
      const { provider, category } = body.data.message

      // Lambda (日本IP) で fetch し、結果を直接渡す
      const result =
        category === 'expiring'
          ? await lambda.fetchExpiring({ provider })
          : await lambda.fetchTitleList({ provider, category })
      const contentIds = await service.fetch(body.data, result)
      if (category !== 'expiring' && category !== 'coming_soon') {
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

// OG メタタグ注入: /anime/:id へのリクエストに対してアニメ情報を埋め込む
app.get('/anime/:id', async (c) => {
  const id = c.req.param('id')
  const prisma = createPrismaClient(c.env.DB)
  try {
    const anime = await prisma.anime.findUnique({
      where: { id },
      select: { title: true, description: true, imageUrl: true }
    })

    // SPA の index.html を ASSETS から取得
    const asset = await c.env.ASSETS.fetch(new URL('/', c.req.url))
    const html = await asset.text()

    if (!anime) {
      return c.html(html)
    }

    const title = escapeHtml(anime.title)
    const description = escapeHtml(anime.description.slice(0, 200))
    const image = escapeHtml(anime.imageUrl)
    const url = escapeHtml(c.req.url)

    const ogTags = [
      `<meta property="og:title" content="${title}" />`,
      `<meta property="og:description" content="${description}" />`,
      `<meta property="og:image" content="${image}" />`,
      `<meta property="og:url" content="${url}" />`,
      `<meta property="og:type" content="website" />`,
      `<meta name="twitter:card" content="summary_large_image" />`,
      `<meta name="twitter:title" content="${title}" />`,
      `<meta name="twitter:description" content="${description}" />`,
      `<meta name="twitter:image" content="${image}" />`,
      `<title>${title} | Nagisa</title>`
    ].join('\n    ')

    const injected = html
      .replace('<title>Nagisa</title>', ogTags)
      .replace(
        '<meta name="description" content="Prime Video / Hulu / Netflix のアニメ録画状況を管理するアプリ" />',
        `<meta name="description" content="${description}" />`
      )

    return c.html(injected)
  } finally {
    await prisma.$disconnect()
  }
})

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export default {
  fetch: app.fetch,
  scheduled,
  queue
}
