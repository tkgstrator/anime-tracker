import { z } from 'zod'

const NagisaSeasonSchema = z.object({
  season_number: z.number().int(),
  episodes: z.array(z.number().int()).nullable()
})

const NagisaJobProgressSchema = z.object({
  current: z.number().int(),
  total: z.number().int()
})

export const NagisaJobSchema = z.object({
  job_id: z.string().nonempty(),
  provider: z.string().nonempty(),
  content_id: z.string().nonempty(),
  title: z.string().nonempty().nullable(),
  seasons: z.array(NagisaSeasonSchema).nullable(),
  timestamp: z.number(),
  processedOn: z.number().nullable(),
  finishedOn: z.number().nullable(),
  progress: NagisaJobProgressSchema.nullable(),
  failedReason: z.string().nonempty().nullable()
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
  memory_used: z.string().nonempty(),
  uptime: z.number().int()
})

export const NagisaSystemSchema = z.object({
  cpu_percent: z.number(),
  memory_percent: z.number(),
  disk_free_gb: z.number()
})

export const NagisaStatusSchema = z.object({
  version: z.string().nonempty(),
  uptime: z.number().int(),
  queue: NagisaQueueSchema,
  redis: NagisaRedisSchema.nullable(),
  system: NagisaSystemSchema.nullable()
})

export type NagisaStatusSchema = z.infer<typeof NagisaStatusSchema>

export const NagisaEpisodePreviewSchema = z.object({
  number: z.number().int(),
  title: z.string().nonempty(),
  content_id: z.string().nonempty(),
  duration: z.number().nonnegative().nullable()
})

export const NagisaPreviewSchema = z.object({
  content_type: z.string().nonempty(),
  title: z.string().nonempty(),
  total_episodes: z.number().int(),
  selected_episodes: z.number().int(),
  media_capabilities: z.array(z.string().nonempty()).nullable(),
  episodes: z.array(NagisaEpisodePreviewSchema)
})

export const NagisaQueueResponseJobSchema = z.object({
  job_id: z.string().nonempty(),
  status: z.string().nonempty(),
  name: z.string().nonempty(),
  data: z.object({
    provider: z.string().nonempty(),
    content_id: z.string().nonempty(),
    seasons: z.array(NagisaSeasonSchema).nullable(),
    marketplace: z.string().nonempty()
  }),
  timestamp: z.number(),
  preview: NagisaPreviewSchema.optional()
})

export const NagisaQueueResponseSchema = z.object({
  count: z.number().int(),
  jobs: z.array(NagisaQueueResponseJobSchema)
})
export type NagisaQueueResponseSchema = z.infer<typeof NagisaQueueResponseSchema>
