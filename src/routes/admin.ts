import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { getAppLogger } from '../lib/logger'
import type { Message } from '../schemas/message.dto'
import { PaginatedUnidentifiedSchema, UnidentifiedListQuerySchema } from '../schemas/unidentified.dto'

const logger = getAppLogger('routes')

type Bindings = {
  DB: D1Database
  SYNC_QUEUE: Queue<Message>
}

const EnqueueResponseSchema = z.object({
  enqueued: z.number().int().min(0)
})

const ArchiveStatsResponseSchema = z.object({
  totalAnime: z.number().int().min(0),
  animeFullyArchived: z.number().int().min(0),
  animeWithMissingKey: z.number().int().min(0),
  totalEpisodes: z.number().int().min(0),
  archivedEpisodes: z.number().int().min(0),
  pendingEpisodes: z.number().int().min(0)
})

const admin = new OpenAPIHono<{ Bindings: Bindings }>()

admin.openapi(
  createRoute({
    method: 'post',
    path: '/abema/enqueue-archive',
    tags: ['Admin'],
    summary: '鍵未取得の ABEMA anime をすべて archive キューに投入する (cron を待たない手動キック)',
    responses: {
      200: {
        description: 'キュー投入結果',
        content: { 'application/json': { schema: EnqueueResponseSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    try {
      const animes = await prisma.anime.findMany({
        where: {
          provider: 'abema',
          seasons: { some: { episodes: { some: { abemaKey: null } } } }
        },
        select: { id: true }
      })
      for (const anime of animes) {
        await c.env.SYNC_QUEUE.send({ type: 'abema_archive', message: { animeId: anime.id } })
      }
      logger.info({ action: 'enqueue-abema-archive', count: animes.length })
      return c.json({ enqueued: animes.length }, 200)
    } finally {
      await prisma.$disconnect()
    }
  }
)

admin.openapi(
  createRoute({
    method: 'get',
    path: '/abema/archive-stats',
    tags: ['Admin'],
    summary: 'ABEMA HLS 鍵 archive の進捗 (anime 単位 / episode 単位)',
    responses: {
      200: {
        description: 'archive 進捗',
        content: { 'application/json': { schema: ArchiveStatsResponseSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    try {
      const [totalAnime, animeWithMissingKey, totalEpisodes, archivedEpisodes] = await Promise.all([
        prisma.anime.count({ where: { provider: 'abema' } }),
        prisma.anime.count({
          where: {
            provider: 'abema',
            seasons: { some: { episodes: { some: { abemaKey: null } } } }
          }
        }),
        prisma.episode.count({ where: { season: { anime: { provider: 'abema' } } } }),
        prisma.episode.count({
          where: { season: { anime: { provider: 'abema' } }, abemaKey: { isNot: null } }
        })
      ])
      return c.json(
        {
          totalAnime,
          animeFullyArchived: totalAnime - animeWithMissingKey,
          animeWithMissingKey,
          totalEpisodes,
          archivedEpisodes,
          pendingEpisodes: totalEpisodes - archivedEpisodes
        },
        200
      )
    } finally {
      await prisma.$disconnect()
    }
  }
)

admin.openapi(
  createRoute({
    method: 'get',
    path: '/unidentified',
    tags: ['Admin'],
    summary: 'AniList で識別できなかったタイトル一覧 (ページネーション + provider/title 検索)',
    request: { query: UnidentifiedListQuerySchema },
    responses: {
      200: {
        description: '未識別タイトル一覧',
        content: { 'application/json': { schema: PaginatedUnidentifiedSchema } }
      }
    }
  }),
  async (c) => {
    const { page, limit, provider, q, order } = c.req.valid('query')
    const prisma = createPrismaClient(c.env.DB)
    try {
      const where = {
        ...(provider ? { provider } : {}),
        ...(q ? { title: { contains: q } } : {})
      }
      const [total, rows] = await Promise.all([
        prisma.unidentifiedAnime.count({ where }),
        prisma.unidentifiedAnime.findMany({
          where,
          orderBy: { updatedAt: order },
          skip: (page - 1) * limit,
          take: limit
        })
      ])
      return c.json(
        {
          data: rows.map((r) => ({
            id: r.id,
            provider: r.provider,
            contentId: r.contentId,
            title: r.title,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString()
          })),
          total,
          page,
          limit,
          totalPages: Math.max(1, Math.ceil(total / limit))
        },
        200
      )
    } finally {
      await prisma.$disconnect()
    }
  }
)

export default admin
