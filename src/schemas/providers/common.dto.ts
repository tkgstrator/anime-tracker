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
  imageUrl: z.url(),
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
