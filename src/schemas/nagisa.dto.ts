import { z } from 'zod'

export const NagisaActiveJobSchema = z.object({
  job_id: z.string(),
  provider: z.string(),
  content_id: z.string(),
  seasons: z
    .array(z.object({ season_number: z.number().int(), episodes: z.array(z.number().int()).nullable().optional() }))
    .nullable(),
  timestamp: z.number()
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
