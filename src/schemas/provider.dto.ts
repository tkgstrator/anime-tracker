import { z } from 'zod'

export const EntityType = z.enum(['tv', 'movie'])
export type EntityType = z.infer<typeof EntityType>

export const ProviderTitle = z.object({
  contentId: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string(),
  entityType: EntityType,
  imageUrl: z.string().nullable(),
  maturityRating: z.number().int().positive().nullable()
})
export type ProviderTitle = z.infer<typeof ProviderTitle>

export const ProviderEpisode = z.object({
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
export type ProviderEpisode = z.infer<typeof ProviderEpisode>

export const ProviderSeason = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  seasonNumber: z.number().int().positive(),
  imageUrl: z.string().nullable(),
  episodes: z.array(ProviderEpisode)
})
export type ProviderSeason = z.infer<typeof ProviderSeason>

export const ProviderTitleDetail = z.object({
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  entityType: EntityType,
  maturityRating: z.number().int().positive().nullable(),
  imageUrl: z.string().nullable(),
  benefitId: z.string().nullable(),
  seasons: z.array(ProviderSeason)
})
export type ProviderTitleDetail = z.infer<typeof ProviderTitleDetail>
