import { z } from 'zod'

export const Provider = z.enum(['amazon', 'hulu', 'netflix'])
export type Provider = z.infer<typeof Provider>

export const AnimeSchema = z.object({
  id: z.uuid(),
  title: z.string().nonempty(),
  description: z
    .string()
    .nonempty()
    .transform((s) => s.replace(/©.*/s, '').trim()),
  provider: z.string().nonempty(),
  contentId: z.string().nonempty(),
  entityType: z.string().nonempty(),
  maturityRating: z.number().int().nonnegative().nullable(),
  imageUrl: z.url(),
  benefitId: z.string().nullable(),
  year: z.number().int(),
  quarter: z.number().int().min(0).max(3),
  isIdentified: z.boolean(),
  status: z.string(),
  scheduled: z.boolean(),
  recorded: z.boolean(),
  createdAt: z.coerce.string().nonempty(),
  updatedAt: z.coerce.string().nonempty()
})
export type AnimeSchema = z.infer<typeof AnimeSchema>
