import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { logger } from '../lib/logger'
import { SEASON_TO_QUARTER, searchAniListChunk } from '../lib/metadata/anilist'
import { createPrismaClient } from '../lib/db'
import { fetchHuluAnimeByDecade } from '../lib/providers/hulu'
import { identifyTmdbChunk } from '../lib/metadata/tmdb'
import {
  AnimeListQuerySchema,
  AnimeSchema,
  AnimeWithSeasonsSchema,
  CreateAnimeSchema,
  IdentifyResultSchema,
  PaginatedAnimeSchema
} from '../schemas/anime.dto'

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
    const { page, limit, provider, year, quarter, status, scheduled, recorded, sort, order, q } = c.req.valid('query')
    const where = {
      isIdentified: true,
      ...(provider ? { provider } : {}),
      ...(year ? { year } : {}),
      ...(quarter != null ? { quarter } : {}),
      ...(status ? { status } : {}),
      ...(scheduled != null ? { scheduled } : {}),
      ...(recorded != null ? { recorded } : {}),
      ...(q ? { title: { contains: q } } : {})
    }
    const orderBy = sort === 'year' ? { year: order } : { title: order }
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
        content: { 'application/json': { schema: AnimeWithSeasonsSchema } }
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
    method: 'post',
    path: '/',
    tags: ['Anime'],
    summary: 'アニメ登録',
    request: {
      body: { content: { 'application/json': { schema: CreateAnimeSchema } } }
    },
    responses: {
      201: {
        description: '登録完了',
        content: { 'application/json': { schema: AnimeSchema } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const body = c.req.valid('json')
    const result = await prisma.anime.create({
      data: {
        title: body.title,
        provider: body.provider,
        contentId: body.contentId,
        entityType: body.entityType,
        maturityRating: body.maturityRating,
        imageUrl: body.imageUrl,
        benefitId: body.benefitId,
        year: body.year,
        quarter: body.quarter
      }
    })
    return c.json(result, 201)
  }
)

anime.openapi(
  createRoute({
    method: 'delete',
    path: '/:id',
    tags: ['Anime'],
    summary: 'アニメ削除',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      204: { description: '削除完了' },
      404: {
        description: 'Not Found',
        content: { 'application/json': { schema: z.object({ error: z.string() }) } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const id = c.req.param('id')
    try {
      await prisma.anime.delete({ where: { id } })
      return new Response(null, { status: 204 })
    } catch {
      return c.json({ error: 'Not found' }, 404)
    }
  }
)

anime.openapi(
  createRoute({
    method: 'post',
    path: '/identify',
    tags: ['Anime'],
    summary: 'AniListでアニメを識別し、タイトル・クォーター・ステータスを更新',
    responses: {
      200: {
        description: '識別結果',
        content: {
          'application/json': { schema: IdentifyResultSchema }
        }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const targets = await prisma.anime.findMany({
      where: {
        OR: [{ isIdentified: false }, { status: 'RELEASING' }]
      },
      select: { id: true, title: true, isIdentified: true }
    })

    logger.info({ context: 'identify', action: 'start', count: targets.length })

    const CHUNK_SIZE = 50
    c.executionCtx.waitUntil(
      (async () => {
        for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
          const chunk = targets.slice(i, i + CHUNK_SIZE)
          const results = await searchAniListChunk(
            chunk.map((a) => a.title),
            i
          )

          for (const [j, anime] of chunk.entries()) {
            const result = results[j]
            if (!result) {
              logger.info({ context: 'identify', action: 'not-found', title: anime.title })
              continue
            }

            const data: { title?: string; isIdentified?: boolean; status?: string; quarter?: number; year?: number } =
              {}

            if (!anime.isIdentified) {
              data.title = result.title.native
              data.isIdentified = true
            }

            data.status = result.status
            data.quarter = SEASON_TO_QUARTER[result.season]
            data.year = result.seasonYear

            await prisma.anime.update({ where: { id: anime.id }, data })

            logger.info({ context: 'identify', action: 'identified', title: anime.title, resolvedTitle: data.title ?? anime.title, status: data.status })
          }

          logger.info({ context: 'identify', action: 'chunk-done', offset: i, chunkSize: chunk.length, total: targets.length })
        }
      })()
    )

    return c.json({ total: targets.length, updated: 0, results: [] })
  }
)

anime.openapi(
  createRoute({
    method: 'post',
    path: '/import/hulu',
    tags: ['Anime'],
    summary: 'Huluから年代別アニメを一括インポート',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              decade: z.enum(['2000', '2010', '2020']).describe('年代 (2000, 2010, 2020)')
            })
          }
        }
      }
    },
    responses: {
      200: {
        description: 'インポート結果',
        content: {
          'application/json': {
            schema: z.object({
              total: z.number().int(),
              created: z.number().int(),
              updated: z.number().int()
            })
          }
        }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const { decade } = c.req.valid('json')
    const items = await fetchHuluAnimeByDecade(Number(decade))

    let created = 0
    let updated = 0

    for (const item of items) {
      const existing = await prisma.anime.findUnique({
        where: { provider_contentId: { provider: 'hulu', contentId: item.slug } }
      })
      await prisma.anime.upsert({
        where: { provider_contentId: { provider: 'hulu', contentId: item.slug } },
        create: {
          title: item.title,
          description: item.description,
          provider: 'hulu',
          contentId: item.slug,
          entityType: item.schema_key === 'series' ? 'tv' : 'movie',
          maturityRating: null,
          imageUrl: item.imageUrl,
          benefitId: 'hulu',
          year: 0,
          quarter: 0
        },
        update: {
          title: item.title,
          description: item.description,
          entityType: item.schema_key === 'series' ? 'tv' : 'movie',
          imageUrl: item.imageUrl
        }
      })
      if (existing) {
        updated++
      } else {
        created++
      }
    }

    return c.json({ total: items.length, created, updated })
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
    path: '/identify/tmdb',
    tags: ['Anime'],
    summary: 'TMDBでアニメを識別し、tmdbIdを保存',
    responses: {
      200: {
        description: '識別結果',
        content: {
          'application/json': {
            schema: z.object({
              total: z.number().int(),
              found: z.number().int(),
              results: z.array(
                z.object({
                  title: z.string(),
                  found: z.boolean(),
                  tmdbId: z.number().int().optional()
                })
              )
            })
          }
        }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const targets = await prisma.anime.findMany({
      where: { tmdbId: null },
      select: { id: true, title: true }
    })

    if (targets.length === 0) {
      return c.json({ total: 0, found: 0, results: [] }, 200)
    }

    const titleMap = new Map(targets.map((t) => [t.id, t.title]))
    const tmdbResults = await identifyTmdbChunk(targets, c.env.TMDB_API_KEY)
    let found = 0

    for (const r of tmdbResults) {
      if (r.found && r.tmdbId) {
        await prisma.anime.update({ where: { id: r.id }, data: { tmdbId: r.tmdbId } })
        found++
      }
    }

    const resultItems = tmdbResults.map((r) => ({
      title: titleMap.get(r.id) ?? '',
      found: r.found,
      tmdbId: r.tmdbId
    }))

    return c.json({ total: targets.length, found, results: resultItems }, 200)
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
