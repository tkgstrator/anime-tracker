import { z } from 'zod'

// --- Auth ---

export const AbemaTokenResponseSchema = z.object({
  user_id: z.string().nonempty(),
  access_token: z.string().nonempty()
})

// --- Image component ---

export const ThumbComponentSchema = z.object({
  urlPrefix: z.string().nonempty(),
  filename: z.string().nonempty(),
  query: z.string().optional(),
  extension: z.string().optional()
})

export function buildImageUrl(thumb: z.infer<typeof ThumbComponentSchema>): string {
  const base = `${thumb.urlPrefix}/${thumb.filename}`
  return thumb.query ? `${base}?${thumb.query}` : base
}

// --- Module item (browse) ---

const LabelSchema = z
  .object({
    newest: z.boolean().optional()
  })
  .catchall(z.unknown())

const ViewingTypeContentLabelSchema = z.object({
  viewingTypeContentLabel: z
    .object({
      name: z.string(),
      viewingType: z.union([z.string(), z.number()])
    })
    .optional()
})

export const ModuleItemSchema = z.object({
  id: z.string().default(''),
  contentId: z.string().optional(),
  contentType: z.string().optional(),
  title: z.string().default(''),
  contentTitle: z.string().default(''),
  contentDescription: z.string().default(''),
  thumb: ThumbComponentSchema.optional().catch(undefined),
  thumbPortrait: ThumbComponentSchema.optional().catch(undefined),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  label: LabelSchema.optional(),
  onDemandTypes: z.array(z.string()).default([]),
  freeBenefitTag: z.string().optional(),
  contentGroupId: z.string().optional(),
  contentGroupTitle: z.string().optional(),
  contentLabels: z.array(ViewingTypeContentLabelSchema).default([])
})
export type ModuleItem = z.infer<typeof ModuleItemSchema>

export const ModuleSchema = z.object({
  id: z.string().nonempty(),
  nameFormat: z.string().default(''),
  itemUiType: z.string().default(''),
  items: z.array(ModuleItemSchema).default([])
})

export const ModulesResponseSchema = z.object({
  modules: z.array(ModuleSchema).default([]),
  next: z.string().nonempty().optional()
})

// --- Genre cards (catalog) ---

export const GenreCardSchema = z.object({
  seriesId: z.string().nonempty(),
  title: z.string().nonempty(),
  label: LabelSchema.optional(),
  thumbComponent: ThumbComponentSchema.optional().catch(undefined),
  thumbPortraitComponent: ThumbComponentSchema.optional().catch(undefined),
  onDemandTypes: z.array(z.number().int()).default([]),
  contentLabels: z.array(ViewingTypeContentLabelSchema).default([])
})
export type GenreCard = z.infer<typeof GenreCardSchema>

export const GenreCardsResponseSchema = z.object({
  cards: z.array(GenreCardSchema).default([]),
  paging: z
    .object({
      next: z.string().nonempty().optional()
    })
    .optional()
})

// --- Series detail ---

const EpisodeGroupSchema = z.object({
  id: z.string().nonempty(),
  name: z.string().default('')
})

export const OrderedSeasonSchema = z.object({
  id: z.string().nonempty(),
  sequence: z.number().int(),
  name: z.string().default(''),
  thumbComponent: ThumbComponentSchema.optional(),
  episodeGroups: z.array(EpisodeGroupSchema).default([]),
  order: z.number().int()
})
export type OrderedSeason = z.infer<typeof OrderedSeasonSchema>

export const SeriesDetailSchema = z.object({
  id: z.string().nonempty(),
  title: z.string().nonempty(),
  orderedSeasons: z.array(OrderedSeasonSchema).default([]),
  onDemandTypes: z.array(z.unknown()).default([]),
  freeBenefitTag: z.string().optional(),
  label: LabelSchema.optional()
})

// --- Programs (episodes) ---

const ProgramEpisodeSchema = z.object({
  number: z.number().int(),
  title: z.string().default(''),
  content: z.string().default('')
})

const ProgramInfoSchema = z.object({
  duration: z.number().int().nonnegative()
})

const ProgramProvidedInfoSchema = z.object({
  thumbImg: z.string().optional(),
  sceneThumbImgs: z.array(z.string()).default([])
})

const ProgramCreditSchema = z.object({
  released: z.number().int().optional()
})

export const ProgramSchema = z.object({
  id: z.string().nonempty(),
  series: z
    .object({
      id: z.string().nonempty(),
      title: z.string().default('')
    })
    .optional(),
  season: z
    .object({
      id: z.string().nonempty(),
      sequence: z.number().int(),
      name: z.string().default(''),
      order: z.number().int()
    })
    .optional(),
  info: ProgramInfoSchema.optional(),
  providedInfo: ProgramProvidedInfoSchema.optional(),
  episode: ProgramEpisodeSchema.optional(),
  credit: ProgramCreditSchema.optional()
})
export type Program = z.infer<typeof ProgramSchema>

export const ProgramsResponseSchema = z.object({
  programs: z.array(ProgramSchema).default([]),
  version: z.unknown().optional()
})
