import { z } from 'zod'
import { BadgeType } from './providers/common.dto'

// ---- リクエスト ----

export const ProviderSchema = z.enum(['amazon', 'hulu'])

export const FetchExpiringRequestSchema = z.object({
  provider: ProviderSchema
})

export const TitleListCategorySchema = z.enum(['new_episode', 'recently_added', 'coming_soon'])

export const FetchTitleListRequestSchema = z.object({
  provider: ProviderSchema,
  category: TitleListCategorySchema
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

export const TitleListEntrySchema = z.object({
  contentId: z.string(),
  title: z.string(),
  description: z.string(),
  entityType: z.string(),
  imageUrl: z.string().nullable(),
  maturityRating: z.number().nullable(),
  benefitId: z.string().nullable(),
  nextEpisodeDate: z.string().nullable(),
  badge: BadgeType.nullable()
})

export const TitleListResponseSchema = z.object({
  fetchedAt: z.string(),
  entries: z.array(TitleListEntrySchema)
})
export type TitleListResponse = z.infer<typeof TitleListResponseSchema>
