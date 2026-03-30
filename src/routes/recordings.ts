import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { getAppLogger } from '../lib/logger'
import { BulkUpdateRecordingSchema, UpdateRecordingSchema } from '../schemas/recording.dto'

const logger = getAppLogger('routes')

type Bindings = { DB: D1Database }

const recordings = new OpenAPIHono<{ Bindings: Bindings }>()

recordings.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Recordings'],
    summary: '録画済みエピソード一覧',
    responses: {
      200: {
        description: '録画済みエピソード一覧',
        content: {
          'application/json': {
            schema: z.array(
              z.object({
                id: z.string(),
                episodeNumber: z.number().int(),
                title: z.string(),
                recorded: z.boolean(),
                season: z.object({
                  displayName: z.string(),
                  anime: z.object({
                    id: z.string(),
                    title: z.string(),
                    provider: z.string(),
                    contentId: z.string()
                  })
                })
              })
            )
          }
        }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const result = await prisma.episode.findMany({
      where: { recorded: true },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        episodeNumber: true,
        title: true,
        recorded: true,
        season: {
          select: {
            displayName: true,
            anime: {
              select: { id: true, title: true, provider: true, contentId: true }
            }
          }
        }
      }
    })
    return c.json(result)
  }
)

recordings.openapi(
  createRoute({
    method: 'put',
    path: '/',
    tags: ['Recordings'],
    summary: 'エピソード録画状態更新',
    request: {
      body: { content: { 'application/json': { schema: UpdateRecordingSchema } } }
    },
    responses: {
      200: {
        description: '更新完了',
        content: { 'application/json': { schema: z.object({ id: z.string(), recorded: z.boolean() }) } }
      },
      404: {
        description: 'Not Found',
        content: { 'application/json': { schema: z.object({ error: z.string().nonempty() }) } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const body = c.req.valid('json')
    try {
      const episode = await prisma.episode.update({
        where: { id: body.episodeId },
        data: { recorded: body.recorded }
      })
      return c.json({ id: episode.id, recorded: episode.recorded }, 200)
    } catch (e) {
      logger.warn({
        action: 'update-not-found',
        episodeId: body.episodeId,
        error: e instanceof Error ? e.message : String(e)
      })
      return c.json({ error: 'Episode not found' }, 404 as const)
    }
  }
)

recordings.openapi(
  createRoute({
    method: 'put',
    path: '/bulk',
    tags: ['Recordings'],
    summary: '一括録画状態更新',
    request: {
      body: { content: { 'application/json': { schema: BulkUpdateRecordingSchema } } }
    },
    responses: {
      200: {
        description: '更新完了',
        content: { 'application/json': { schema: z.object({ updated: z.number() }) } }
      }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    const body = c.req.valid('json')
    const result = await prisma.episode.updateMany({
      where: { id: { in: body.episodeIds } },
      data: { recorded: body.recorded }
    })
    return c.json({ updated: result.count })
  }
)

export default recordings
