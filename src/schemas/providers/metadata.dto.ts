import { z } from 'zod'
import { TitleSeasonTypeEnum, TitleStatusTypeEnum } from './common.dto'

export const MetadataMediaSchema = z.object({
  id: z.number().int(),
  title: z.object({
    native: z.string().nonempty()
  }),
  countryOfOrigin: z.enum(['JP']),
  status: TitleStatusTypeEnum,
  season: TitleSeasonTypeEnum.nullable(),
  seasonYear: z.number().int().min(0).max(2038).nullable(),
  startDate: z.object({
    year: z.number().int().nullable(),
    month: z.number().int().nullable(),
    day: z.number().int().nullable()
  })
})

export const MetadataResponseSchema = z.object({
  data: z.object({
    Page: z.object({
      media: z.array(MetadataMediaSchema).nonempty()
    })
  })
})

export const TitleMetadataSchema = z
  .object({
    tmdbId: z.number().int().optional(),
    aniListId: z.number().int().optional(),
    title: z.string().nonempty(),
    status: TitleStatusTypeEnum,
    year: z.number().int().min(0).max(2038),
    quarter: z.number().int().min(0).max(3)
  })
  .refine((v) => v.tmdbId != null || v.aniListId != null, {
    message: 'Either tmdbId or aniListId is required'
  })
export type TitleMetadata = z.infer<typeof TitleMetadataSchema>
