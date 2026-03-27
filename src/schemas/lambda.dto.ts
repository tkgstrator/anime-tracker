import { z } from 'zod'

// ---- リクエスト ----

export const ProviderSchema = z.enum(['amazon', 'hulu'])

export const FetchExpiringRequestSchema = z.object({
  provider: ProviderSchema
})

export const FetchNewEpisodeRequestSchema = z.object({
  provider: ProviderSchema
})

// ---- レスポンス ----

export const ExpiringEntrySchema = z.object({
  contentId: z.string(),
  expiredAt: z.string(),
  expiringSeason: z.number().nullable()
})

export const ExpiringResponseSchema = z.object({
  fetchedAt: z.string(),
  entries: z.array(ExpiringEntrySchema)
})
export type ExpiringResponse = z.infer<typeof ExpiringResponseSchema>

export const NewEpisodeEntrySchema = z.object({
  contentId: z.string(),
  title: z.string(),
  description: z.string(),
  entityType: z.string(),
  imageUrl: z.string().nullable(),
  maturityRating: z.number().nullable(),
  benefitId: z.string().nullable(),
  nextEpisodeDate: z.string().nullable(),
  hasNewContent: z.boolean()
})

export const NewEpisodeResponseSchema = z.object({
  fetchedAt: z.string(),
  entries: z.array(NewEpisodeEntrySchema)
})
export type NewEpisodeResponse = z.infer<typeof NewEpisodeResponseSchema>
