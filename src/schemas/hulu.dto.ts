import z from 'zod'

const _EntityTypeEnum = z.enum(['tv'])

const SchemaKeyTypeEnum = z.enum(['asset'])

const HuluServiceTypeEnum = z.enum(['hulu'])

const HuluAdditionalInfoSchema = z.object({
  card_info: z
    .object({
      episode_number_title: z
        .string()
        .nonempty()
        .regex(/(\d+)/)
        .transform((v) => {
          const match = v.match(/(\d+)/)
          if (match === null) {
            throw new Error('invalid episode_number_title')
          }
          return [...match][0]
        })
        .pipe(z.coerce.number()),
      has_closed_caption: z.boolean(),
      has_en_caption: z.boolean(),
      has_ja_caption: z.boolean(),
      season_number_title: z.string().optional()
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
  service: HuluServiceTypeEnum,
  short_name: z.string().nullable()
})

const HuluEpisodeSchema = z.object({
  id: z.number().int().positive(),
  id_in_schema: z.number().int().positive(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  slug: z.string().nonempty(),
  imageUrl: z.url(),
  rental: z.boolean(),
  startAt: z.string().nonempty(),
  endAt: z.string().nonempty(),
  isLogin: z.boolean(),
  schema_key: SchemaKeyTypeEnum,
  model_id: z.string().nonempty(),
  additionalInfo: HuluAdditionalInfoSchema
})

export type HuluEpisode = z.infer<typeof HuluEpisodeSchema>

export const HuluEpisodesSchema = z.array(HuluEpisodeSchema).nonempty()
