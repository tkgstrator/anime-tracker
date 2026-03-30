import { z } from 'zod'

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
  year: z.number().int(),
  quarter: z.number().int().min(0).max(3),
  isIdentified: z.boolean(),
  status: z.string(),
  aniListId: z.number().int(),
  badge: z.string().nullable(),
  nextEpisodeDate: z.coerce.string().nullable(),
  expiredAt: z.coerce.string().nullable(),
  expiringSeason: z.number().int().positive().nullable(),
  scheduled: z.boolean(),
  recorded: z.boolean(),
  createdAt: z.coerce.string().nonempty(),
  updatedAt: z.coerce.string().nonempty()
})
export type AnimeSchema = z.infer<typeof AnimeSchema>

export const AnimeInfoSchema = AnimeSchema.extend({
  seasons: z.array(
    z.object({
      id: z.uuid(),
      seasonId: z.string().nonempty(),
      displayName: z.string().nonempty(),
      seasonNumber: z.number().int().nonnegative(),
      episodes: z.array(
        z.object({
          id: z.uuid(),
          episodeNumber: z.number().int().nonnegative(),
          episodeId: z.string().nonempty(),
          title: z.string().nonempty(),
          description: z.string().nonempty(),
          releaseDate: z.coerce.string().nonempty(),
          duration: z.number().int().nonnegative(),
          maturityRating: z.number().int().nonnegative().nullable(),
          imageUrl: z.string().nonempty(),
          hasSubtitles: z.boolean(),
          hasDub: z.boolean(),
          benefitId: z.string().nonempty().nullable(),
          recorded: z.boolean()
        })
      )
    })
  )
})
export type AnimeInfoSchema = z.infer<typeof AnimeInfoSchema>

export const QuarterLabel: Record<number, string> = {
  0: '冬',
  1: '春',
  2: '夏',
  3: '秋'
}

export const AnimeListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  provider: z.string().nonempty().optional(),
  year: z.coerce.number().int().optional(),
  quarter: z.coerce.number().int().min(0).max(3).optional(),
  status: z.string().nonempty().optional(),
  scheduled: z.coerce.boolean().optional(),
  recorded: z.coerce.boolean().optional(),
  badge: z.string().nonempty().optional(),
  aniListId: z.coerce.number().int().optional(),
  sort: z.enum(['title', 'year', 'updatedAt']).default('title'),
  order: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().nonempty().optional(),
  exclusive: z.coerce.boolean().optional()
})
export type AnimeListQuerySchema = z.infer<typeof AnimeListQuerySchema>

export const BadgedAnimeSchema = z.object({
  NEW_EPISODE: z.array(AnimeSchema),
  RECENTLY_ADDED: z.array(AnimeSchema),
  COMING_SOON: z.array(AnimeSchema),
  EXPIRING: z.array(AnimeSchema)
})
export type BadgedAnimeSchema = z.infer<typeof BadgedAnimeSchema>

export const PaginatedAnimeSchema = z.object({
  data: z.array(AnimeSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int()
})
export type PaginatedAnimeSchema = z.infer<typeof PaginatedAnimeSchema>
