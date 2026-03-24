import { z } from 'zod'

export const Provider = z.enum(['amazon', 'hulu', 'netflix'])
export type Provider = z.infer<typeof Provider>

export const AnimeSchema = z.object({
  id: z.string().uuid(),
  title: z.string().nonempty(),
  description: z.string().transform((s) => s.replace(/©.*/s, '').trim()),
  provider: z.string().nonempty(),
  contentId: z.string().nonempty(),
  entityType: z.string().nonempty(),
  maturityRating: z.number().int().nonnegative().nullable(),
  imageUrl: z.string().nullable(),
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

export const AnimeWithSeasonsSchema = AnimeSchema.extend({
  seasons: z.array(
    z.object({
      id: z.string().uuid(),
      seasonId: z.string().nonempty(),
      displayName: z.string().nonempty(),
      seasonNumber: z.number().int().nonnegative(),
      imageUrl: z.string().nullable(),
      episodes: z.array(
        z.object({
          id: z.string().uuid(),
          episodeNumber: z.number().int().positive(),
          episodeId: z.string().nonempty(),
          title: z.string().nonempty(),
          description: z.string(),
          releaseDate: z.string().nonempty(),
          duration: z.number().int().nonnegative(),
          maturityRating: z.number().int().nonnegative().nullable(),
          imageUrl: z.string().nonempty(),
          hasSubtitles: z.boolean(),
          hasDub: z.boolean(),
          benefitId: z.string().nullable(),
          recorded: z.boolean()
        })
      )
    })
  )
})
export type AnimeWithSeasonsSchema = z.infer<typeof AnimeWithSeasonsSchema>

export const IdentifyResultItemSchema = z.object({
  id: z.string().uuid(),
  found: z.boolean(),
  oldTitle: z.string(),
  newTitle: z.string().nullable(),
  status: z.string().nullable(),
  quarter: z.number().int().min(0).max(3),
  year: z.number().int()
})
export type IdentifyResultItemSchema = z.infer<typeof IdentifyResultItemSchema>

export const IdentifyResultSchema = z.object({
  total: z.number().int(),
  updated: z.number().int(),
  results: z.array(IdentifyResultItemSchema)
})
export type IdentifyResultSchema = z.infer<typeof IdentifyResultSchema>

export const QuarterLabel: Record<number, string> = {
  0: '冬',
  1: '春',
  2: '夏',
  3: '秋'
}

export const AnimeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  provider: z.string().optional(),
  year: z.coerce.number().int().optional(),
  quarter: z.coerce.number().int().min(0).max(3).optional(),
  status: z.string().optional(),
  scheduled: z.coerce.boolean().optional(),
  recorded: z.coerce.boolean().optional(),
  sort: z.enum(['title', 'year']).default('title'),
  order: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().optional()
})
export type AnimeListQuerySchema = z.infer<typeof AnimeListQuerySchema>

export const PaginatedAnimeSchema = z.object({
  data: z.array(AnimeSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int()
})
export type PaginatedAnimeSchema = z.infer<typeof PaginatedAnimeSchema>

export const CreateAnimeSchema = z.object({
  title: z.string().nonempty(),
  provider: z.string().nonempty(),
  contentId: z.string().nonempty(),
  entityType: z.string().nonempty().default('tv'),
  maturityRating: z.number().int().nonnegative().optional(),
  imageUrl: z.string().url().optional(),
  benefitId: z.string().optional(),
  year: z.number().int().min(1900).max(2100),
  quarter: z.number().int().min(0).max(3)
})
export type CreateAnimeSchema = z.infer<typeof CreateAnimeSchema>
