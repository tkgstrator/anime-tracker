import { z } from 'zod'
import { EntityType, TitleSchema } from './common.dto'

/** ブラウズ URL 生成時の検索クエリ。`buildAmazonBrowseUrl` で使用。 */
export const AmazonBrowseQuerySchema = z.object({
  keyword: z.string().default(''),
  searchAlias: z.string().default('instant-video')
})
export type AmazonBrowseQuery = z.infer<typeof AmazonBrowseQuerySchema>

/** ブラウズページの entity.entityType に含まれるコンテンツ種別。 */
export const AmazonEntityTypeEnum = z
  .enum(['TV Show', 'Movie', 'Educational', 'Short Film'])
  .transform((v) => (v === 'Movie' ? EntityType.enum.movie : EntityType.enum.tv))
export type AmazonBrowseEntityType = z.infer<typeof AmazonEntityTypeEnum>

/** 詳細ページ Widgets API から取得した個別エピソード。{@link AmazonSeasonSchema} の要素。 */
export const AmazonEpisodeSchema = z.object({
  episodeNumber: z.number().int().positive(),
  titleID: z.string().nonempty(),
  title: z.string().nonempty(),
  description: z.string().nonempty(),
  isPrime: z.boolean(),
  releaseDate: z.string().nonempty(),
  duration: z.number().int(),
  maturityRating: z.number().int().nullable(),
  imageUrl: z.url(),
  hasSubtitles: z.boolean()
})
export type AmazonEpisode = z.infer<typeof AmazonEpisodeSchema>

/** 詳細ページ Widgets API から取得したシーズン情報。{@link AmazonTitleDetailSchema} の要素。 */
export const AmazonSeasonSchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  seasonNumber: z.number().int().positive(),
  episodeCount: z.number().int().nonnegative(),
  comingSoon: z.boolean(),
  episodes: z.array(AmazonEpisodeSchema).nonempty()
})
export type AmazonSeason = z.infer<typeof AmazonSeasonSchema>

/** `fetchAmazonTitleDetail` が組み立てるタイトル詳細。Provider 内部で TitleInfo へ変換される。 */
export const AmazonTitleDetailSchema = z.object({
  titleID: z.string().nonempty(),
  title: z.string().nonempty(),
  entityType: z.string().nonempty(),
  maturityRating: z.number().int().nullable(),
  seasons: z.array(AmazonSeasonSchema).nonempty()
})
export type AmazonTitleDetail = z.infer<typeof AmazonTitleDetailSchema>

/** ブラウズページ `<script type="application/json">` 内の個別エンティティ。transform で {@link TitleSchema} に変換される。 */
const AmazonBrowseHTMLEntitySchema = z
  .object({
    titleID: z.string().nonempty(),
    displayTitle: z.string().nonempty(),
    synopsis: z.string().nonempty(),
    entityType: AmazonEntityTypeEnum,
    images: z.object({
      cover: z.object({ url: z.url() })
    }),
    entitlementCues: z.object({
      titleMetadataBadge: z.object({ message: z.string().nonempty().optional() })
    })
  })
  .transform((v) =>
    TitleSchema.parse({
      contentId: v.titleID,
      title: v.displayTitle,
      description: v.synopsis,
      entityType: v.entityType,
      imageUrl: v.images.cover.url,
      maturityRating: null,
      benefitId: null
    })
  )
export type AmazonBrowseHTMLEntity = z.infer<typeof AmazonBrowseHTMLEntitySchema>

/** ブラウズページ `<script type="application/json">` の全体構造。`parseBrowseHtml` で使用。transform で Title[] を返す。 */
export const AmazonBrowseHTMLSchema = z
  .object({
    init: z.object({
      preparations: z
        .object({
          body: z.object({
            containers: z
              .array(
                z.object({
                  entities: z.array(AmazonBrowseHTMLEntitySchema).nonempty()
                })
              )
              .nonempty()
          })
        })
        .optional()
    })
  })
  .transform((v) =>
    v.init.preparations === undefined ? [] : v.init.preparations?.body.containers.flatMap((v) => v.entities)
  )

export type AmazonPaginateParams = {
  paginationTargetId: string
  serviceToken: string
}

export const AmazonPaginateResponseSchame = z.object({
  entities: z.array(z.record(z.string(), z.unknown())),
  hasMoreItems: z.boolean(),
  pagination: z
    .object({
      queryParameters: z.object({
        serviceToken: z.string().nonempty().optional()
      })
    })
    .optional()
})

export type AmazonPaginateResponse = z.infer<typeof AmazonPaginateResponseSchame>

// --- Detail page embedded JSON schemas ---

/** 詳細ページ HTML の headerDetail セクション。タイトル・あらすじ・エンティティタイプ・レーティングを含む。 */
const AmazonDetailHeaderSchema = z
  .object({
    title: z.string().nonempty(),
    synopsis: z.string().nonempty(),
    entityType: z.string().nonempty(),
    ratingBadge: z.object({
      displayText: z.string().nonempty()
    })
  })
  .transform((v) => ({
    ...v,
    maturityRating: (() => {
      const match = v.ratingBadge.displayText.match(/(\d+)/)
      return match ? Number.parseInt(match[1], 10) : null
    })()
  }))

/** 詳細ページ HTML のシーズンエントリ。シーズン選択 UI に使用。 */
const AmazonDetailSeasonEntrySchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  sequenceNumber: z.number().int().positive()
})

const AmazonEpisodePageTokenSchema = z.object({
  token: z.string().nonempty().optional()
})

const AmazonDetailAtfStateSchema = z.object({
  detail: z.object({
    headerDetail: z.record(z.string().nonempty(), AmazonDetailHeaderSchema)
  }),
  seasons: z.record(z.string(), z.array(AmazonDetailSeasonEntrySchema).nonempty())
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

/** `extractPageData` が返すページデータ。detail.ts 内で TitleInfo 構築に使用。 */

export const AmazonPageDataSchema = z.object({
  title: z.string().nonempty(),
  synopsis: z.string().nonempty(),
  entityType: AmazonEntityTypeEnum,
  maturityRating: z.number().int().positive().nullable(),
  seasons: z.array(
    z.object({
      seasonId: z.string().nonempty(),
      displayName: z.string().nonempty(),
      seasonNumber: z.number().int().positive()
    })
  ),
  episodePageTokens: z.array(z.string().nonempty())
})
export type AmazonPageData = z.infer<typeof AmazonPageDataSchema>

/** 詳細ページ `<script type="application/json">` の全体構造。`extractPageData` で使用。transform でフラットな構造に変換。 */
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
      title: headerDetail.title,
      synopsis: headerDetail.synopsis,
      entityType: headerDetail.entityType,
      maturityRating: headerDetail.maturityRating,
      seasons: rawSeasons
        .map((s) => ({ seasonId: s.seasonId, displayName: s.displayName, seasonNumber: s.sequenceNumber }))
        .sort((a, b) => a.seasonNumber - b.seasonNumber),
      episodePageTokens: episodePages.map((p) => p.token).filter((t): t is string => t !== undefined)
    }
  })
  .pipe(AmazonPageDataSchema)
