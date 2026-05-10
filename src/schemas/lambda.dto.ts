import { z } from 'zod'
import { TitleSchema, TitleStatusTypeEnum } from './providers/common.dto'

// ---- リクエスト ----

export const ProviderSchema = z.enum(['amazon', 'hulu', 'crunchyroll', 'abema'])

export const FetchExpiringRequestSchema = z.object({
  provider: ProviderSchema
})

export const TitleListCategorySchema = z.enum(['new_episode', 'coming_soon', 'catalog'])

export const FetchTitleListRequestSchema = z.object({
  provider: ProviderSchema,
  category: TitleListCategorySchema
})

// ---- レスポンス ----

export const ExpiringEntrySchema = z.object({
  contentId: z.string().nonempty(),
  expiredAt: z.string().nonempty(),
  expiringSeason: z.number().nullable()
})

export const ExpiringResponseSchema = z.object({
  fetchedAt: z.string().nonempty(),
  entries: z.array(ExpiringEntrySchema)
})
export type ExpiringResponse = z.infer<typeof ExpiringResponseSchema>

export const TitleListEntrySchema = TitleSchema.omit({ expiring: true })

export const TitleListResponseSchema = z.object({
  fetchedAt: z.string().nonempty(),
  entries: z.array(TitleListEntrySchema)
})
export type TitleListResponse = z.infer<typeof TitleListResponseSchema>

export const FetchTitleInfoRequestSchema = z.object({
  provider: z.string().nonempty(),
  contentId: z.string().nonempty()
})

// ---- identify ----

export const IdentifyResultSchema = z
  .object({
    aniListId: z.number().int().optional(),
    title: z.string().nonempty(),
    status: TitleStatusTypeEnum,
    year: z.number().int(),
    quarter: z.number().int()
  })
  .nullable()

export const IdentifyResponseSchema = z.object({
  results: z.array(IdentifyResultSchema)
})
