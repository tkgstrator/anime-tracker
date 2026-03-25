import { Zodios } from '@zodios/core'
import { z } from 'zod'
import { AnimeInfoSchema, AnimeSchema, PaginatedAnimeSchema } from '@/schemas/anime.dto'
import { BulkUpdateRecordingSchema, UpdateRecordingSchema } from '@/schemas/recording.dto'

const api = new Zodios('/api', [
  {
    method: 'get',
    path: '/anime',
    alias: 'getAnimeList',
    parameters: [
      { name: 'page', type: 'Query', schema: z.number().int().min(1).optional() },
      { name: 'limit', type: 'Query', schema: z.number().int().min(1).max(100).optional() },
      { name: 'provider', type: 'Query', schema: z.string().optional() },
      { name: 'year', type: 'Query', schema: z.number().int().optional() },
      { name: 'quarter', type: 'Query', schema: z.number().int().min(0).max(3).optional() },
      { name: 'status', type: 'Query', schema: z.string().optional() },
      { name: 'recentlyUpdated', type: 'Query', schema: z.boolean().optional() },
      { name: 'upcoming', type: 'Query', schema: z.boolean().optional() },
      { name: 'scheduled', type: 'Query', schema: z.boolean().optional() },
      { name: 'recorded', type: 'Query', schema: z.boolean().optional() },
      { name: 'sort', type: 'Query', schema: z.enum(['title', 'year', 'updatedAt']).optional() },
      { name: 'order', type: 'Query', schema: z.enum(['asc', 'desc']).optional() },
      { name: 'q', type: 'Query', schema: z.string().optional() }
    ],
    response: PaginatedAnimeSchema
  },
  {
    method: 'get',
    path: '/anime/:id',
    alias: 'getAnime',
    response: AnimeInfoSchema
  },
  {
    method: 'post',
    path: '/anime/:id/record',
    alias: 'recordAnime',
    response: z.object({ success: z.boolean() })
  },
  {
    method: 'patch',
    path: '/anime/:id',
    alias: 'updateAnime',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: z.object({
          scheduled: z.boolean().optional(),
          recorded: z.boolean().optional()
        })
      }
    ],
    response: AnimeSchema
  },
  {
    method: 'get',
    path: '/recordings',
    alias: 'getRecordings',
    response: z.array(
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
  },
  {
    method: 'put',
    path: '/recordings',
    alias: 'updateRecording',
    parameters: [{ name: 'body', type: 'Body', schema: UpdateRecordingSchema }],
    response: z.object({ id: z.string(), recorded: z.boolean() })
  },
  {
    method: 'put',
    path: '/recordings/bulk',
    alias: 'bulkUpdateRecording',
    parameters: [{ name: 'body', type: 'Body', schema: BulkUpdateRecordingSchema }],
    response: z.object({ updated: z.number() })
  }
])

export default api
