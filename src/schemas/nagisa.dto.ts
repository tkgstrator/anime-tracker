import { z } from 'zod'

export const NagisaActiveJobSchema = z.object({
  job_id: z.string(),
  provider: z.string(),
  content_id: z.string(),
  title: z.string().nonempty().optional(),
  seasons: z
    .array(z.object({ season_number: z.number().int(), episodes: z.array(z.number().int()).nullable().optional() }))
    .nullable(),
  timestamp: z.number(),
  processedOn: z.number().optional(),
  progress: z
    .object({
      current: z.number().int(),
      total: z.number().int()
    })
    .optional()
})

export const NagisaQueueSchema = z.object({
  wait: z.number().int(),
  active: z.number().int(),
  completed: z.number().int(),
  failed: z.number().int(),
  delayed: z.number().int()
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
  queue: NagisaQueueSchema.nullable(),
  active_jobs: z.array(NagisaActiveJobSchema),
  redis: NagisaRedisSchema.nullable(),
  system: NagisaSystemSchema.nullable()
})

export type NagisaStatusSchema = z.infer<typeof NagisaStatusSchema>

export const NagisaEpisodePreviewSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  content_id: z.string(),
  duration: z.number().int().nullable()
})

export const NagisaPreviewSchema = z.object({
  content_type: z.string(),
  title: z.string(),
  total_episodes: z.number().int(),
  selected_episodes: z.number().int(),
  media_capabilities: z.array(z.string()).nullable(),
  episodes: z.array(NagisaEpisodePreviewSchema)
})

export const NagisaJobSchema = z.object({
  job_id: z.string(),
  status: z.string(),
  name: z.string(),
  data: z.object({
    provider: z.string(),
    content_id: z.string(),
    seasons: z
      .array(z.object({ season_number: z.number().int(), episodes: z.array(z.number().int()).nullable().optional() }))
      .nullable(),
    marketplace: z.string().nullable()
  }),
  timestamp: z.number(),
  preview: NagisaPreviewSchema.optional()
})

export const NagisaQueueResponseSchema = z.object({
  count: z.number().int(),
  jobs: z.array(NagisaJobSchema)
})
export type NagisaQueueResponseSchema = z.infer<typeof NagisaQueueResponseSchema>
