import { z } from 'zod'

const stripQueryParams = (url: string) => new URL(url).origin + new URL(url).pathname

export const HuluEpisodeInfo = z.object({
  meta_id: z.number(),
  name: z.string(),
  short_name: z.string(),
  ref_id: z.string(),
  type: z.string(),
  schema_id: z.number(),
  thumbnail: z.string()
})

export const HuluCardInfo = z
  .object({
    artwork_copyright: z.string().optional(),
    episode_count: z.number().optional(),
    has_closed_caption: z.boolean().optional(),
    has_en_caption: z.boolean().optional(),
    is_mature: z.boolean().optional(),
    premiere_year: z.number().optional(),
    season_count: z.number().optional()
  })
  .passthrough()

export const HuluAdditionalInfo = z.object({
  card_info: HuluCardInfo,
  edge_episode: HuluEpisodeInfo.nullable().optional(),
  lead_episode: HuluEpisodeInfo.nullable().optional(),
  id_in_schema: z.number(),
  id: z.number(),
  schema_id: z.number(),
  schema_key: z.string(),
  service: z.string(),
  series_id: z.number().optional(),
  slug: z.string().nullable(),
  type: z.string(),
  rating_v2: z.string(),
  rating: z.string(),
  viewing_period_undisplay_flag: z.boolean()
})

export const HuluVodItem = z.object({
  id: z.number(),
  id_in_schema: z.number(),
  title: z.string(),
  description: z.string(),
  slug: z.string(),
  imageUrl: z.string().transform(stripQueryParams),
  rental: z.boolean(),
  startAt: z.string(),
  endAt: z.string(),
  isLogin: z.boolean(),
  schema_key: z.string(),
  model_id: z.string(),
  categoryMetas: z.array(z.string()),
  price: z.string(),
  features: z.array(z.string()).default([]),
  additionalInfo: HuluAdditionalInfo,
  bottomMetas: z.array(z.string()),
  progress: z.number(),
  playTime: z.string(),
  isPublishEnded: z.boolean(),
  isTvodLive: z.boolean()
})
export type HuluVodItem = z.infer<typeof HuluVodItem>

export const HuluPaletteResponse = z.object({
  total_count: z.number(),
  data: z.array(HuluVodItem)
})
export type HuluPaletteResponse = z.infer<typeof HuluPaletteResponse>

export const Season = z.enum(['winter', 'spring', 'summer', 'autumn'])
export type Season = z.infer<typeof Season>

// --- Episode Detail schemas ---

export const HuluEpisodeCardInfo = z.object({
  copyright: z.string().optional(),
  episode_number_title: z.string().optional(),
  has_closed_caption: z.boolean(),
  has_en_caption: z.boolean(),
  has_ja_caption: z.boolean(),
  is_mature: z.boolean(),
  season_number_title: z.string().optional()
})

export const HuluEpisodeAdditionalInfo = z.object({
  card_info: HuluEpisodeCardInfo,
  episode_runtime: z.number(),
  id_in_schema: z.number(),
  id: z.number(),
  rating_v2: z.string(),
  rating: z.string(),
  schema_id: z.number(),
  schema_key: z.string(),
  series_id: z.number(),
  service: z.string(),
  slug: z.string().nullable(),
  short_name: z.string(),
  type: z.string()
})

export const HuluEpisodeDetail = z.object({
  id: z.number(),
  id_in_schema: z.number(),
  title: z.string(),
  description: z.string(),
  slug: z.string(),
  imageUrl: z.string().transform(stripQueryParams),
  startAt: z.string(),
  endAt: z.string(),
  additionalInfo: HuluEpisodeAdditionalInfo,
  playTime: z.string(),
  series_meta_id: z.number()
})
export type HuluEpisodeDetail = z.infer<typeof HuluEpisodeDetail>
