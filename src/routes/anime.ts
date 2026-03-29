import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { getAppLogger } from '../lib/logger'
import {
  AnimeInfoSchema,
  AnimeListQuerySchema,
  AnimeSchema,
  BadgedAnimeSchema,
  PaginatedAnimeSchema
} from '../schemas/anime.dto'
import { NagisaQueueResponseSchema } from '../schemas/nagisa.dto'

const logger = getAppLogger('routes')

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
    const { page, limit, provider, year, quarter, status, scheduled, recorded, badge, aniListId, sort, order, q } =
      c.req.valid('query')
    const where = {
      isIdentified: true,
      ...(provider ? { provider } : {}),
      ...(year ? { year } : {}),
      ...(quarter != null ? { quarter } : {}),
      ...(status ? { status } : {}),
      ...(scheduled != null ? { scheduled } : {}),
      ...(recorded != null ? { recorded } : {}),
      ...(q ? { title: { contains: q } } : {}),
      ...(badge ? { badge } : {}),
      ...(aniListId ? { aniListId } : {})
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
    path: '/badged',
    tags: ['Anime'],
    summary: 'バッジ付きアニメをバッジ種別ごとにグループ化して取得',
    responses: {
      200: {
        description: 'バッジ別アニメ一覧',
        content: { 'application/json': { schema: BadgedAnimeSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const rows = await prisma.anime.findMany({
      where: { isIdentified: true, badge: { not: null } },
      orderBy: { title: 'asc' }
    })
    const result = {
      NEW_EPISODE: [] as typeof rows,
      RECENTLY_ADDED: [] as typeof rows,
      COMING_SOON: [] as typeof rows,
      EXPIRING: [] as typeof rows
    }
    for (const row of rows) {
      const key = row.badge as keyof typeof result
      if (key in result) {
        result[key].push(row)
      }
    }
    c.header('Cache-Control', 'no-store')
    return c.json(result)
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
    } catch (e) {
      logger.warn({ action: 'patch-not-found', id, error: e instanceof Error ? e.message : String(e) })
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
        content: { 'application/json': { schema: NagisaQueueResponseSchema } }
      },
      400: {
        description: '未録画エピソードなし',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
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

    // 未録画エピソードをシーズン情報付きで取得
    const unrecordedEpisodes = await prisma.episode.findMany({
      where: {
        recorded: false,
        season: { animeId: id }
      },
      select: { episodeNumber: true, season: { select: { seasonNumber: true } } },
      orderBy: [{ season: { seasonNumber: 'asc' } }, { episodeNumber: 'asc' }]
    })

    if (unrecordedEpisodes.length === 0) {
      return c.json({ error: 'No unrecorded episodes' }, 400 as const)
    }

    // シーズンごとにエピソード番号をグループ化
    const seasonMap = new Map<number, number[]>()
    for (const ep of unrecordedEpisodes) {
      const sn = ep.season.seasonNumber
      const eps = seasonMap.get(sn)
      if (eps) {
        eps.push(ep.episodeNumber)
      } else {
        seasonMap.set(sn, [ep.episodeNumber])
      }
    }
    const seasons = [...seasonMap.entries()].map(([season_number, episodes]) => ({ season_number, episodes }))

    const requestBody = {
      provider: row.provider,
      items: [{ content_id: row.contentId, seasons }]
    }
    logger.info({ action: 'record-request', id, body: requestBody })

    const res = await fetch(`${c.env.BACKEND_URL}/api/queues`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'CF-Access-Client-Id': c.env.CF_ACCESS_CLIENT_ID,
        'CF-Access-Client-Secret': c.env.CF_ACCESS_CLIENT_SECRET
      },
      body: JSON.stringify(requestBody)
    })

    if (!res.ok) {
      const text = await res.text()
      logger.error({
        action: 'record-backend-error',
        id,
        provider: row.provider,
        contentId: row.contentId,
        status: res.status,
        body: text
      })
      return c.json({ error: `Backend error: ${res.status} ${text}` }, 502 as const)
    }

    const data = await res.json()
    logger.info({
      action: 'record-sent',
      id,
      provider: row.provider,
      contentId: row.contentId,
      episodeCount: unrecordedEpisodes.length
    })
    return c.json(data as NagisaQueueResponseSchema, 200)
  }
)

export default anime
