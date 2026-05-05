import { z } from 'zod'

const NagisaSeasonSchema = z.object({
  season_number: z.number().int(),
  episodes: z.array(z.number().int()).nullable().optional()
})

const NagisaJobProgressSchema = z.object({
  current: z.number().int(),
  total: z.number().int()
})

export const NagisaJobSchema = z.object({
  job_id: z.string(),
  provider: z.string(),
  content_id: z.string(),
  title: z.string().nullable().optional(),
  seasons: z.array(NagisaSeasonSchema).nullable(),
  timestamp: z.number(),
  processedOn: z.number().nullable().optional(),
  finishedOn: z.number().nullable().optional(),
  progress: NagisaJobProgressSchema.nullable().optional(),
  failedReason: z.string().nullable().optional()
})

export type NagisaJob = z.infer<typeof NagisaJobSchema>

export const NagisaQueueCategorySchema = z.object({
  count: z.number().int(),
  jobs: z.array(NagisaJobSchema)
})

export const NagisaQueueSchema = z.object({
  active: NagisaQueueCategorySchema,
  wait: NagisaQueueCategorySchema,
  completed: NagisaQueueCategorySchema,
  failed: NagisaQueueCategorySchema,
  delayed: NagisaQueueCategorySchema
})

export const NagisaRedisSchema = z.object({
  connected: z.boolean(),
  memory_used: z.string(),
  uptime: z.number().int()
})

export const NagisaSystemSchema = z.object({
  cpu_percent: z.number(),
  memory_percent: z.number(),
  disk_free_gb: z.number()
})

export const NagisaStatusSchema = z.object({
  version: z.string(),
  uptime: z.number().int(),
  queue: NagisaQueueSchema,
  redis: NagisaRedisSchema.nullable(),
  system: NagisaSystemSchema.nullable()
})

export type NagisaStatusSchema = z.infer<typeof NagisaStatusSchema>

export const NagisaEpisodePreviewSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  content_id: z.string(),
  duration: z.number().nonnegative().nullable()
})

export const NagisaPreviewSchema = z.object({
  content_type: z.string(),
  title: z.string(),
  total_episodes: z.number().int(),
  selected_episodes: z.number().int(),
  media_capabilities: z.array(z.string()).nullable(),
  episodes: z.array(NagisaEpisodePreviewSchema)
})

export const NagisaQueueResponseJobSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  name: z.string(),
  data: z.object({
    provider: z.string(),
    content_id: z.string(),
    seasons: z.array(NagisaSeasonSchema).nullable(),
    marketplace: z.string().nullable()
  }),
  timestamp: z.number(),
  preview: NagisaPreviewSchema.optional()
})

export const NagisaQueueResponseSchema = z.object({
  count: z.number().int(),
  jobs: z.array(NagisaQueueResponseJobSchema)
})
export type NagisaQueueResponseSchema = z.infer<typeof NagisaQueueResponseSchema>
