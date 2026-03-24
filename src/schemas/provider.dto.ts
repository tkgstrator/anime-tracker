import { z } from 'zod'

export const EntityType = z.enum(['tv', 'movie'])
export type EntityType = z.infer<typeof EntityType>

export const TitleSchema = z.object({
  contentId: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string(),
  entityType: EntityType,
  imageUrl: z.string().nullable(),
  maturityRating: z.number().int().positive().nullable(),
  benefitId: z.string().nullable()
})

export type Title = z.infer<typeof TitleSchema>

export const EpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  episodeId: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  releaseDate: z.string().nonempty(),
  duration: z.number().int().nonnegative(),
  maturityRating: z.number().int().positive().nullable(),
  imageUrl: z.string().nonempty(),
  hasSubtitles: z.boolean(),
  hasDub: z.boolean(),
  benefitId: z.string().nullable()
})
export type Episode = z.infer<typeof EpisodeSchema>

export const SeasonSchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  seasonNumber: z.number().int().positive(),
  imageUrl: z.string().nullable(),
  episodes: z.array(EpisodeSchema)
})
export type Season = z.infer<typeof SeasonSchema>

export const TitleInfoSchema = z.object({
  title: z.string().nonempty(),
  description: z.string(),
  entityType: EntityType,
  imageUrl: z.string().nullable(),
  maturityRating: z.number().int().positive().nullable(),
  benefitId: z.string().nullable(),
  seasons: z.array(SeasonSchema)
})
export type TitleInfo = z.infer<typeof TitleInfoSchema>

export const TitleSeasonTypeEnum = z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL'])

export const TitleStatusTypeEnum = z.enum([
  'FINISHED',
  'RELEASING',
  'NOT_YET_RELEASED',
  'CANCELLED',
  'HIATUS',
  'UNKNOWN'
])
export type TitleStatusType = z.infer<typeof TitleStatusTypeEnum>

export const MetadataMediaSchema = z.object({
  id: z.number().int(),
  title: z.object({
    native: z.string().nonempty()
  }),
  countryOfOrigin: z.enum(['JP']),
  status: TitleStatusTypeEnum,
  season: TitleSeasonTypeEnum,
  seasonYear: z.number().int().min(0).max(2038)
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

export const TitleDetailedInfoSchema = TitleInfoSchema.extend({
  metadata: TitleMetadataSchema
})

export type TitleDetailedInfo = z.infer<typeof TitleDetailedInfoSchema>
