import { z } from 'zod'

export const UnidentifiedAnimeSchema = z.object({
  id: z.uuid(),
  provider: z.string().nonempty(),
  contentId: z.string().nonempty(),
  title: z.string().nonempty(),
  createdAt: z.coerce.string().nonempty(),
  updatedAt: z.coerce.string().nonempty()
})
export type UnidentifiedAnimeSchema = z.infer<typeof UnidentifiedAnimeSchema>

export const UnidentifiedListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  provider: z.string().nonempty().optional(),
  q: z.string().nonempty().optional(),
  order: z.enum(['asc', 'desc']).default('desc')
})
export type UnidentifiedListQuerySchema = z.infer<typeof UnidentifiedListQuerySchema>

export const PaginatedUnidentifiedSchema = z.object({
  data: z.array(UnidentifiedAnimeSchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totalPages: z.number().int()
})
export type PaginatedUnidentifiedSchema = z.infer<typeof PaginatedUnidentifiedSchema>
