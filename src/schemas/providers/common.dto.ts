import { z } from 'zod'

/** URL からクエリパラメータを除去する */
export const stripQueryParams = (url: string) => new URL(url).origin + new URL(url).pathname

export const EntityType = z.enum(['tv', 'movie'])
export type EntityType = z.infer<typeof EntityType>

/** タイトルのバッジ種別 */
export const BadgeType = z.enum(['NEW_EPISODE', 'RECENTLY_ADDED', 'COMING_SOON', 'EXPIRING'])
export type BadgeType = z.infer<typeof BadgeType>

export const TitleSchema = z.object({
  contentId: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  entityType: EntityType,
  imageUrl: z.url().transform(stripQueryParams),
  maturityRating: z.number().int().positive().nullable(),
  nextEpisodeDate: z.iso.datetime().optional(),
  badge: BadgeType.optional(),
  expiring: z
    .object({
      remainingHours: z.number().int().positive(),
      season: z.number().int().positive().nullable()
    })
    .optional()
})

export type Title = z.infer<typeof TitleSchema>

export const EpisodeSchema = z.object({
  episodeNumber: z.number().int().nonnegative(),
  episodeId: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  releaseDate: z.iso.datetime(),
  duration: z.number().int().nonnegative(),
  maturityRating: z.number().int().positive().nullable(),
  imageUrl: z.url().transform(stripQueryParams),
  hasSubtitles: z.boolean(),
  hasDub: z.boolean(),
  benefitId: z.string().nullable()
})
export type Episode = z.infer<typeof EpisodeSchema>

export const SeasonSchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  seasonNumber: z.number().int().positive(),
  episodes: z.array(EpisodeSchema)
})
export type Season = z.infer<typeof SeasonSchema>

export const TitleInfoSchema = z.object({
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  entityType: EntityType,
  maturityRating: z.number().int().positive().nullable(),
  imageUrl: z.url().transform(stripQueryParams),
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
