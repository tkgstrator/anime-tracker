import { kanji2number } from '@geolonia/japanese-numeral'
import z from 'zod'
import { stripQueryParams } from './common.dto'

// --- Browse schemas (Palette API / Filtered API) ---

const EpisodeInfo = z.object({
  meta_id: z.number(),
  name: z.string(),
  short_name: z.string(),
  ref_id: z.string(),
  type: z.string(),
  schema_id: z.number(),
  thumbnail: z.string()
})

const CardInfo = z
  .object({
    artwork_copyright: z.string().optional(),
    episode_count: z.number().optional(),
    has_closed_caption: z.boolean().optional(),
    has_en_caption: z.boolean().optional(),
    is_mature: z.boolean().optional(),
    premiere_year: z.number().optional(),
    season_count: z.number().optional(),
    badge_text_end_at: z.string().nonempty().optional(),
    coming_soon_text: z.string().optional()
  })
  .loose()

const BrowseAdditionalInfo = z.object({
  card_info: CardInfo,
  edge_episode: EpisodeInfo.nullable().optional(),
  lead_episode: EpisodeInfo.nullable().optional(),
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

export const VodItemSchema = z.object({
  id: z.number(),
  id_in_schema: z.number(),
  title: z.string(),
  description: z.string(),
  slug: z.string(),
  imageUrl: z.string().transform(stripQueryParams),
  rental: z.boolean(),
  startAt: z.string().nonempty(),
  endAt: z.preprocess(
    (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null),
    z.string().nonempty().nullable()
  ),
  isLogin: z.boolean(),
  schema_key: z.string(),
  model_id: z.string(),
  categoryMetas: z.array(z.string()),
  price: z.string(),
  features: z.array(z.string()).default([]),
  additionalInfo: BrowseAdditionalInfo,
  bottomMetas: z.array(z.string()),
  progress: z.number(),
  playTime: z.string(),
  isPublishEnded: z.boolean(),
  isTvodLive: z.boolean()
})
export type VodItem = z.infer<typeof VodItemSchema>

/** slug と additionalInfo を持たない宣伝エントリを除外してからパースする */
export const PaletteResponseSchema = z.object({
  total_count: z.number().int(),
  data: z.preprocess(
    (v) => (Array.isArray(v) ? v.filter((i: Record<string, unknown>) => i?.slug && i?.additionalInfo) : v),
    z.array(VodItemSchema)
  )
})
// --- Episode Detail schemas (RSC payload) ---

const SchemaKeyTypeEnum = z.enum(['asset'])

const ServiceTypeEnum = z.enum(['hulu'])

const AdditionalInfoSchema = z.object({
  card_info: z
    .object({
      episode_number_title: z
        .string()
        .nonempty()
        .transform((v) => {
          const digitMatch = v.match(/(\d+)/)
          if (digitMatch) return Number(digitMatch[1])
          const kanjiMatch = v.match(/[一二三四五六七八九十百千万億兆]+/)
          if (kanjiMatch) return kanji2number(kanjiMatch[0])
          return null
        })
        .nullish()
        .transform((v) => v ?? null),
      has_closed_caption: z.boolean(),
      has_en_caption: z.boolean(),
      has_ja_caption: z.boolean(),
      season_number_title: z.string().nonempty().optional()
    })
    .transform((v) => {
      return {
        ...v,
        has_subtitles: v.has_closed_caption || v.has_en_caption || v.has_ja_caption,
        has_dub: false
      }
    }),
  episode_runtime: z.number().positive(),
  schema_key: z.string(),
  series_id: z.number().int().positive(),
  service: ServiceTypeEnum,
  short_name: z.string().nullable()
})

const EpisodeSchema = z.object({
  id: z.number().int().positive(),
  id_in_schema: z.number().int().positive(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  slug: z.string().nonempty(),
  imageUrl: z.url().transform(stripQueryParams),
  rental: z.boolean(),
  startAt: z.string().nonempty(),
  endAt: z.preprocess(
    (v: unknown) => (typeof v === 'string' && v.length > 0 ? v : null),
    z.string().nonempty().nullable()
  ),
  isLogin: z.boolean(),
  schema_key: SchemaKeyTypeEnum,
  model_id: z.string().nonempty(),
  additionalInfo: AdditionalInfoSchema
})

export type Episode = z.infer<typeof EpisodeSchema>

export const EpisodesSchema = z.array(EpisodeSchema).nonempty()

const ValueSchema = z
  .object({
    value: z.string().nonempty()
  })
  .transform((v) => v.value)

export const FalcorMetaSchema = z
  .object({
    name: ValueSchema,
    slug: ValueSchema,
    description: ValueSchema,
    thumbnailUrl: ValueSchema,
    service: ValueSchema
  })
  .transform(({ thumbnailUrl, ...rest }) => ({ ...rest, imageUrl: stripQueryParams(thumbnailUrl) }))

export const FalcorMetaResponseSchema = z
  .object({
    jsonGraph: z.object({
      meta: z.record(z.string(), FalcorMetaSchema)
    })
  })
  .transform((v) => ({
    jsonGraph: { meta: Object.values(v.jsonGraph.meta)[0] }
  }))

export type FalcorMeta = z.infer<typeof FalcorMetaSchema>
