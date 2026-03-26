import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import dayjs from 'dayjs'
import { createPrismaClient } from '../lib/db'
import { AnimeInfoSchema, AnimeListQuerySchema, AnimeSchema, PaginatedAnimeSchema } from '../schemas/anime.dto'

type Bindings = {
  DB: D1Database
  TMDB_API_KEY: string
  BACKEND_URL: string
  CF_ACCESS_CLIENT_ID: string
  CF_ACCESS_CLIENT_SECRET: string
}

const anime = new OpenAPIHono<{ Bindings: Bindings }>()

anime.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Anime'],
    summary: 'アニメ一覧取得（ページネーション対応）',
    request: {
      query: AnimeListQuerySchema
    },
    responses: {
      200: {
        description: 'アニメ一覧',
        content: { 'application/json': { schema: PaginatedAnimeSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const {
      page,
      limit,
      provider,
      year,
      quarter,
      status,
      scheduled,
      recorded,
      recentlyUpdated,
      upcoming,
      expiring,
      sort,
      order,
      q
    } = c.req.valid('query')
    const sevenDaysAgo = dayjs().subtract(7, 'day').toDate()
    const where = {
      isIdentified: true,
      ...(provider ? { provider } : {}),
      ...(year ? { year } : {}),
      ...(quarter != null ? { quarter } : {}),
      ...(status ? { status } : {}),
      ...(scheduled != null ? { scheduled } : {}),
      ...(recorded != null ? { recorded } : {}),
      ...(q ? { title: { contains: q } } : {}),
      ...(recentlyUpdated ? { seasons: { some: { episodes: { some: { releaseDate: { gte: sevenDaysAgo } } } } } } : {}),
      ...(upcoming ? { nextEpisodeDate: { not: null } } : {}),
      ...(expiring ? { expiredAt: { not: null } } : {})
    }
    const orderBy = sort === 'year' ? { year: order } : sort === 'updatedAt' ? { updatedAt: order } : { title: order }
    const [data, total] = await Promise.all([
      prisma.anime.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit
      }),
      prisma.anime.count({ where })
    ])
    const totalPages = Math.ceil(total / limit)
    c.header('Cache-Control', 'no-store')
    return c.json({ data, total, page, limit, totalPages })
  }
)

anime.openapi(
  createRoute({
    method: 'get',
    path: '/:id',
    tags: ['Anime'],
    summary: 'アニメ詳細取得（シーズン・エピソード含む）',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: 'アニメ詳細',
        content: { 'application/json': { schema: AnimeInfoSchema } }
      },
      404: {
        description: 'Not Found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const id = c.req.param('id')
    const row = await prisma.anime.findUnique({
      where: { id },
      include: {
        seasons: {
          orderBy: { seasonNumber: 'asc' },
          include: {
            episodes: { orderBy: { episodeNumber: 'asc' } }
          }
        }
      }
    })
    if (!row) return c.json({ error: 'Not found' }, 404)
    return c.json(row, 200)
  }
)

anime.openapi(
  createRoute({
    method: 'patch',
    path: '/:id',
    tags: ['Anime'],
    summary: 'アニメの録画予約・録画済み状態を更新',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              scheduled: z.boolean().optional(),
              recorded: z.boolean().optional()
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: '更新完了',
        content: { 'application/json': { schema: AnimeSchema } }
      },
      404: {
        description: 'Not Found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const id = c.req.param('id')
    const body = c.req.valid('json')
    try {
      const result = await prisma.anime.update({
        where: { id },
        data: {
          ...(body.scheduled != null ? { scheduled: body.scheduled } : {}),
          ...(body.recorded != null ? { recorded: body.recorded } : {})
        }
      })
      return c.json(result, 200)
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  }
)

anime.openapi(
  createRoute({
    method: 'post',
    path: '/:id/record',
    tags: ['Anime'],
    summary: 'バックエンドに録画リクエストを送信',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: {
        description: '録画リクエスト成功',
        content: { 'application/json': { schema: z.object({ success: z.boolean() }) } }
      },
      404: {
        description: 'Not Found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
      },
      502: {
        description: 'バックエンドエラー',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const id = c.req.param('id')
    const row = await prisma.anime.findUnique({
      where: { id },
      select: { provider: true, contentId: true }
    })
    if (!row) return c.json({ error: 'Not found' }, 404)

    const res = await fetch(`${c.env.BACKEND_URL}/api/queues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET
      },
      body: JSON.stringify({ provider: row.provider, content_id: row.contentId })
    })

    if (!res.ok) {
      const text = await res.text()
      return c.json({ error: `Backend error: ${res.status} ${text}` }, 502 as const)
    }

    return c.json({ success: true }, 200)
  }
)

export default anime
