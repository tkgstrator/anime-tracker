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
  expiredAt: z.iso.datetime(),
  expiringSeason: z.number().nullable()
})

export const ExpiringResponseSchema = z.object({
  fetchedAt: z.iso.datetime(),
  entries: z.array(ExpiringEntrySchema)
})
export type ExpiringResponse = z.infer<typeof ExpiringResponseSchema>

export const TitleListEntrySchema = TitleSchema.omit({ expiring: true })

export const TitleListResponseSchema = z.object({
  fetchedAt: z.iso.datetime(),
  entries: z.array(TitleListEntrySchema)
})
export type TitleListResponse = z.infer<typeof TitleListResponseSchema>

export const FetchTitleInfoRequestSchema = z.object({
  provider: z.string().nonempty(),
  contentId: z.string().nonempty()
})

export const FetchAbemaArchiveRequestSchema = z.object({
  programIds: z.array(z.string().nonempty()).min(1).max(20),
  targetHeight: z.number().int().positive().max(2160).optional()
})

export const AbemaArchiveRecordSchema = z.object({
  programId: z.string().nonempty(),
  cid: z.string().nonempty(),
  contentKeyHex: z.string().length(32),
  ivHex: z.string().length(32),
  variantUrl: z.string().nonempty(),
  variantResolution: z.string().nonempty(),
  variantBandwidth: z.number().int().nonnegative(),
  segmentUrls: z.array(z.string().nonempty())
})

export const AbemaArchiveResultEntrySchema = z.object({
  programId: z.string().nonempty(),
  ok: z.boolean(),
  archive: AbemaArchiveRecordSchema.optional(),
  error: z.string().optional()
})

export const FetchAbemaArchiveResponseSchema = z.object({
  results: z.array(AbemaArchiveResultEntrySchema)
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

export const IdentifyRequestSchema = z.object({
  titles: z.array(z.string().nonempty()).max(50)
})
