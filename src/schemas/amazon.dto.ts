import { z } from 'zod'

export const AmazonGenreSchema = z
  .enum([
    'av_genre_animation_adult_interest',
    'av_genre_action_and_adventure',
    'av_genre_drama',
    'av_genre_comedy',
    'av_genre_sci_fi',
    'av_genre_fantasy',
    'av_genre_romance',
    'av_genre_horror'
  ])
  .describe('Prime Video ジャンルフィルタ')
export type AmazonGenre = z.infer<typeof AmazonGenreSchema>

export const AmazonBrowseQuerySchema = z.object({
  keyword: z.string().default('').describe('検索キーワード'),
  searchAlias: z.string().default('instant-video').describe('検索対象サービス')
})
export type AmazonBrowseQuery = z.infer<typeof AmazonBrowseQuerySchema>

// --- Browse API response schemas ---

export const AmazonBrowseEntityTypeSchema = z.enum(['TV Show', 'Movie', 'Educational', 'Short Film'])
export type AmazonBrowseEntityType = z.infer<typeof AmazonBrowseEntityTypeSchema>

export const AmazonBrowseItemSchema = z.object({
  titleID: z.string().nonempty(),
  displayTitle: z.string().nonempty(),
  title: z.string().nonempty(),
  synopsis: z.string().nonempty(),
  entityType: AmazonBrowseEntityTypeSchema,
  releaseYear: z.string().nonempty(),
  images: z.object({
    cover: z.object({ url: z.url() })
  }),
  link: z.object({ url: z.string().nonempty() }),
  maturityRatingBadge: z.object({
    displayText: z.string().nonempty()
  }),
  impressionId: z.string().nonempty()
})
export type AmazonBrowseItem = z.infer<typeof AmazonBrowseItemSchema>

// --- Detail page embedded JSON schemas ---

export const AmazonDetailHeaderSchema = z.object({
  title: z.string().nonempty(),
  synopsis: z.string().nonempty(),
  entityType: z.string().nonempty(),
  ratingBadge: z.object({ displayText: z.string().nonempty() })
})
export type AmazonDetailHeader = z.infer<typeof AmazonDetailHeaderSchema>

export const AmazonDetailSeasonEntrySchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  sequenceNumber: z.number().int().positive()
})
export type AmazonDetailSeasonEntry = z.infer<typeof AmazonDetailSeasonEntrySchema>

const AmazonEpisodePageTokenSchema = z.object({
  token: z.string().nonempty().optional()
})

const AmazonDetailAtfStateSchema = z.object({
  detail: z.object({
    headerDetail: z.record(z.string(), AmazonDetailHeaderSchema)
  }),
  seasons: z.record(z.string(), z.array(AmazonDetailSeasonEntrySchema).nonempty()).optional()
})

const AmazonDetailBtfStateSchema = z.object({
  episodeList: z.object({
    actions: z
      .object({
        episodePages: z.array(AmazonEpisodePageTokenSchema).nonempty()
      })
      .default({ episodePages: [] })
  })
})

export const AmazonDetailPageJsonSchema = z
  .object({
    init: z.object({
      preparations: z.object({
        body: z.object({
          atf: z.object({ state: AmazonDetailAtfStateSchema }),
          btf: z.object({ state: AmazonDetailBtfStateSchema })
        })
      })
    })
  })
  .transform(({ init }) => {
    const { atf, btf } = init.preparations.body

    const headerDetail = Object.values(atf.state.detail.headerDetail)[0]
    if (!headerDetail) throw new Error('Parse failed: headerDetail not found')

    const rawSeasons = Object.values(atf.state.seasons ?? {})[0] ?? []
    const episodePages = btf.state.episodeList.actions.episodePages

    return {
      title: headerDetail.title.trim(),
      synopsis: headerDetail.synopsis,
      entityType: headerDetail.entityType,
      ratingDisplayText: headerDetail.ratingBadge.displayText,
      seasons: rawSeasons
        .map((s) => ({ seasonId: s.seasonId, displayName: s.displayName, seasonNumber: s.sequenceNumber }))
        .sort((a, b) => a.seasonNumber - b.seasonNumber),
      episodePageTokens: episodePages.map((p) => p.token).filter((t): t is string => t !== undefined)
    }
  })
export type AmazonDetailPageJson = z.output<typeof AmazonDetailPageJsonSchema>

// --- extractPageData output schema ---

export const AmazonRawSeasonInfoSchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  seasonNumber: z.number().int().positive()
})
export type AmazonRawSeasonInfo = z.infer<typeof AmazonRawSeasonInfoSchema>

export const AmazonPageDataSchema = z.object({
  title: z.string().nonempty(),
  synopsis: z.string().nonempty(),
  entityType: z.string().nonempty(),
  maturityRating: z.number().int().positive().nullable(),
  seasons: z.array(AmazonRawSeasonInfoSchema),
  episodePageTokens: z.array(z.string().nonempty())
})
export type AmazonPageData = z.infer<typeof AmazonPageDataSchema>

// --- Title Detail schemas ---

export const AmazonEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  titleID: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  isPrime: z.boolean(),
  releaseDate: z.string().nonempty().describe('ISO 8601 形式 (JST)'),
  duration: z.number().int().describe('秒数'),
  maturityRating: z.number().int().nullable().describe('レーティング年齢 (例: 13, 16, null=すべて)'),
  imageUrl: z.string().nonempty().describe('カバー画像 URL'),
  hasSubtitles: z.boolean().describe('字幕の有無')
})
export type AmazonEpisode = z.infer<typeof AmazonEpisodeSchema>

export const AmazonSeasonSchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  seasonNumber: z.number().int().positive(),
  episodeCount: z.number().int().nonnegative(),
  comingSoon: z.boolean(),
  episodes: z.array(AmazonEpisodeSchema).nonempty()
})
export type AmazonSeason = z.infer<typeof AmazonSeasonSchema>

export const AmazonTitleDetailSchema = z.object({
  titleID: z.string().nonempty(),
  title: z.string().nonempty(),
  entityType: z.string().nonempty(),
  maturityRating: z.number().int().nullable().describe('レーティング年齢 (例: 13, 16, null=すべて)'),
  seasons: z.array(AmazonSeasonSchema).nonempty()
})
export type AmazonTitleDetail = z.infer<typeof AmazonTitleDetailSchema>
