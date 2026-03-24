import { OpenAPIHono } from '@hono/zod-openapi'
import { apiReference } from '@scalar/hono-api-reference'
import animeRoutes from './routes/anime'
import recordingsRoutes from './routes/recordings'
import { scheduled } from './scheduled'

type Bindings = { DB: D1Database; TMDB_API_KEY: string }

const app = new OpenAPIHono<{ Bindings: Bindings }>()

app.route('/api/anime', animeRoutes)
app.route('/api/recordings', recordingsRoutes)

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
  scheduled
}
