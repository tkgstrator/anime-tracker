import { z } from 'zod'

// --- Auth ---

export const TokenResponseSchema = z.object({
  access_token: z.string().nonempty(),
  expires_in: z.number().int().positive(),
  token_type: z.literal('Bearer'),
  scope: z.string(),
  country: z.string()
})

// --- Browse (discover/browse API) ---

const ImageVariantSchema = z.object({
  height: z.number().int().positive(),
  width: z.number().int().positive(),
  source: z.string().url(),
  type: z.string()
})

const ImagesSchema = z.object({
  poster_tall: z.array(z.array(ImageVariantSchema)).optional(),
  poster_wide: z.array(z.array(ImageVariantSchema)).optional(),
  thumbnail: z.array(z.array(ImageVariantSchema)).optional()
})

const SeriesMetadataSchema = z.object({
  audio_locales: z.array(z.string()).default([]),
  episode_count: z.number().int().nonnegative().optional(),
  is_dubbed: z.boolean().default(false),
  is_subbed: z.boolean().default(false),
  is_simulcast: z.boolean().default(false),
  maturity_ratings: z.array(z.string()).default([]),
  season_count: z.number().int().nonnegative().optional(),
  series_launch_year: z.number().int().optional(),
  tenant_categories: z.array(z.string()).default([]),
  extended_maturity_rating: z
    .object({
      level: z.string(),
      rating: z.string(),
      system: z.string()
    })
    .optional()
    .catch(undefined)
})

export const BrowseItemSchema = z.object({
  type: z.string(),
  id: z.string().nonempty(),
  title: z.string(),
  slug_title: z.string(),
  description: z.string(),
  images: ImagesSchema,
  series_metadata: SeriesMetadataSchema.optional(),
  new: z.boolean().optional(),
  last_public: z.string().optional(),
  channel_id: z.string().optional()
})
export type BrowseItem = z.infer<typeof BrowseItemSchema>

export const BrowseResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(BrowseItemSchema)
})

// --- Season ---

export const SeasonItemSchema = z.object({
  id: z.string().nonempty(),
  title: z.string(),
  slug_title: z.string(),
  series_id: z.string().nonempty(),
  season_number: z.number().int().nonnegative(),
  season_sequence_number: z.number().int().nonnegative().optional(),
  number_of_episodes: z.number().int().nonnegative(),
  is_subbed: z.boolean().default(false),
  is_dubbed: z.boolean().default(false),
  audio_locale: z.string().optional(),
  audio_locales: z.array(z.string()).default([]),
  subtitle_locales: z.array(z.string()).default([]),
  images: ImagesSchema.optional(),
  identifier: z.string().optional()
})
export type SeasonItem = z.infer<typeof SeasonItemSchema>

export const SeasonsResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(SeasonItemSchema)
})

// --- Episode ---

export const EpisodeItemSchema = z.object({
  id: z.string().nonempty(),
  title: z.string(),
  slug_title: z.string().optional(),
  description: z.string().default(''),
  episode: z.string().default('0'),
  episode_number: z.number().int().nonnegative().nullable().optional(),
  episode_air_date: z.string().optional(),
  premium_available_date: z.string().optional(),
  upload_date: z.string().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  season_id: z.string().optional(),
  season_number: z.number().int().nonnegative().optional(),
  season_title: z.string().optional(),
  series_id: z.string().optional(),
  series_title: z.string().optional(),
  series_slug_title: z.string().optional(),
  is_subbed: z.boolean().default(false),
  is_dubbed: z.boolean().default(false),
  closed_captions_available: z.boolean().default(false),
  is_premium_only: z.boolean().default(false),
  images: ImagesSchema.optional(),
  audio_locale: z.string().optional(),
  subtitle_locales: z.array(z.string()).default([])
})
export type EpisodeItem = z.infer<typeof EpisodeItemSchema>

export const EpisodesResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(EpisodeItemSchema)
})

// --- Series Detail ---

export const SeriesDetailSchema = z.object({
  id: z.string().nonempty(),
  title: z.string(),
  slug_title: z.string(),
  description: z.string(),
  images: ImagesSchema,
  season_tags: z.array(z.string()).default([]),
  keywords: z.array(z.string()).default([]),
  extended_maturity_rating: z
    .object({
      level: z.string(),
      rating: z.string(),
      system: z.string()
    })
    .optional()
    .catch(undefined),
  maturity_ratings: z.array(z.string()).default([]),
  is_subbed: z.boolean().default(false),
  is_dubbed: z.boolean().default(false),
  is_simulcast: z.boolean().default(false),
  audio_locales: z.array(z.string()).default([]),
  subtitle_locales: z.array(z.string()).default([])
})

export const SeriesDetailResponseSchema = z.object({
  total: z.number().int().nonnegative(),
  data: z.array(SeriesDetailSchema)
})

// --- Helpers ---

/**
 * images から最大解像度の poster_wide URL を取得する。
 * poster_wide がなければ poster_tall、それもなければ null。
 */
export function getBestImageUrl(images: z.infer<typeof ImagesSchema>): string | null {
  const candidates = images.poster_wide?.[0] ?? images.poster_tall?.[0] ?? []
  if (candidates.length === 0) return null
  // 最大幅のものを選択
  return candidates.reduce((best, cur) => (cur.width > best.width ? cur : best)).source
}

/**
 * images から最大解像度の thumbnail URL を取得する。
 */
export function getBestThumbnailUrl(images: z.infer<typeof ImagesSchema>): string | null {
  const candidates = images.thumbnail?.[0] ?? images.poster_wide?.[0] ?? []
  if (candidates.length === 0) return null
  return candidates.reduce((best, cur) => (cur.width > best.width ? cur : best)).source
}
