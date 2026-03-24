import z from 'zod'

const _EntityTypeEnum = z.enum(['tv'])

const SchemaKeyTypeEnum = z.enum(['asset'])

const HuluServiceTypeEnum = z.enum(['hulu'])

const HuluAdditionalInfoSchema = z.object({
  card_info: z.object({
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
      .pipe(z.coerce.number())
  }),
  episode_runtime: z.number().positive(),
  schema_key: z.number().int().positive(),
  series_id: z.number().int().positive(),
  service: HuluServiceTypeEnum
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

export const HuluPageSchema = z.object({
  episodes: z.array(HuluEpisodeSchema)
})
