import { z } from 'zod'

const ProviderEnum = z.enum(['amazon', 'crunchyroll', 'hulu', 'abema'])
const LanguageEnum = z.enum(['sub', 'dub'])
const MarketplaceEnum = z.enum(['jp', 'us'])
const ContentTypeEnum = z.enum(['movie', 'series'])

// --- Queue response (POST /api/queues) ---

const NagisaSeasonFilterSchema = z.object({
  season_number: z.number().int(),
  episodes: z.array(z.number().int()).nullable()
})

export const NagisaEpisodePreviewSchema = z.object({
  number: z.number().int(),
  title: z.string().nonempty(),
  title_en: z.string().nonempty().optional(),
  content_id: z.string().nonempty(),
  duration: z.number().nonnegative().nullable()
})

export const NagisaPreviewSchema = z.object({
  content_type: ContentTypeEnum,
  title: z.string().nonempty(),
  title_en: z.string().nonempty().optional(),
  marketplace: MarketplaceEnum,
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
    provider: ProviderEnum,
    content_id: z.string().nonempty(),
    title: z.string().nonempty(),
    seasons: z.array(NagisaSeasonFilterSchema).nullable(),
    marketplace: MarketplaceEnum.optional(),
    language: LanguageEnum.optional()
  }),
  timestamp: z.number(),
  preview: NagisaPreviewSchema.optional()
})

export const NagisaQueueResponseSchema = z.object({
  count: z.number().int(),
  jobs: z.array(NagisaQueueResponseJobSchema)
})
export type NagisaQueueResponseSchema = z.infer<typeof NagisaQueueResponseSchema>

// --- Status response (GET /api/status) ---

const NagisaJobProgressSchema = z.object({
  current: z.number().int(),
  total: z.number().int()
})

const NagisaStatusJobSeasonSchema = z.object({
  season_number: z.number().int(),
  episodes: z.array(z.number().int())
})

export const NagisaStatusJobSchema = z.object({
  job_id: z.string().nonempty(),
  provider: ProviderEnum,
  content_id: z.string().nonempty(),
  title: z.string().nullable(),
  seasons: z.array(NagisaStatusJobSeasonSchema),
  marketplace: MarketplaceEnum.nullable(),
  progress: NagisaJobProgressSchema.nullable(),
  timestamp: z.number(),
  processedOn: z.number(),
  finishedOn: z.number().nullable(),
  failedReason: z.string().nullable()
})
export type NagisaStatusJob = z.infer<typeof NagisaStatusJobSchema>

const NagisaQueueCategorySchema = z.object({
  count: z.number().int(),
  jobs: z.array(NagisaStatusJobSchema)
})

const NagisaQueueSchema = z.object({
  wait: NagisaQueueCategorySchema,
  active: NagisaQueueCategorySchema,
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
  queue: NagisaQueueSchema.nullable(),
  redis: NagisaRedisSchema.nullable(),
  system: NagisaSystemSchema.nullable()
})
export type NagisaStatusSchema = z.infer<typeof NagisaStatusSchema>
