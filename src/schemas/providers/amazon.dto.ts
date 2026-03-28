import { z } from 'zod'
import { parseExpiringMessage } from '../../lib/providers/amazon/expiring'
import { EntityType, TitleSchema } from './common.dto'

/** ブラウズ URL 生成時の検索クエリ。`buildAmazonBrowseUrl` で使用。 */
export const BrowseQuerySchema = z.object({
  keyword: z.string().default(''),
  searchAlias: z.string().default('instant-video')
})
export type BrowseQuery = z.infer<typeof BrowseQuerySchema>

/** ブラウズページの entity.entityType に含まれるコンテンツ種別。 */
const EntityTypeEnum = z
  .enum(['TV Show', 'Movie', 'Educational', 'Short Film', 'Unknown'])
  .transform((v) => (v === 'Movie' ? EntityType.enum.movie : EntityType.enum.tv))

/** ブラウズページ `<script type="application/json">` 内の個別エンティティ。transform で {@link TitleSchema} に変換される。 */
export const BrowseEntitySchema = z
  .object({
    titleID: z.string().nonempty(),
    displayTitle: z.string().nonempty(),
    synopsis: z.string().nonempty(),
    entityType: EntityTypeEnum,
    images: z.object({
      cover: z.object({ url: z.url() })
    }),
    entitlementCues: z.object({
      titleMetadataBadge: z.object({ message: z.string().nonempty().optional() }),
      highValueMessage: z
        .object({ message: z.string().optional() })
        .optional()
        .transform((v) => {
          const msg = v?.message?.trim()
          return msg ? { message: msg } : undefined
        })
    })
  })
  .transform((v) => {
    const hvm = v.entitlementCues.highValueMessage?.message
    const parsed = hvm ? parseExpiringMessage(hvm) : undefined
    return TitleSchema.parse({
      contentId: v.titleID,
      title: v.displayTitle,
      description: v.synopsis,
      entityType: v.entityType,
      imageUrl: v.images.cover.url,
      maturityRating: null,
      benefitId: null,
      hasNewContent: !!v.entitlementCues.titleMetadataBadge.message,
      expiring: parsed ? { remainingHours: parsed.remainingHours, season: parsed.season } : undefined
    })
  })

/** コンテナ配列からエンティティを抽出する共通 transform */
const ContainersSchema = z
  .array(z.object({ entities: z.array(BrowseEntitySchema).nonempty() }))
  .nonempty()
  .transform((containers) => containers.flatMap((c) => c.entities))

/** ブラウズページ `<script type="text/template">` の全体構造。transform で Title[] を返す。 */
export const BrowseHTMLSchema = z.union([
  // 新形式: props.body[].props.browse.containers
  z
    .object({
      props: z.object({
        body: z.array(z.object({ props: z.object({ browse: z.object({ containers: ContainersSchema }) }) })).nonempty()
      })
    })
    .transform((v) => v.props.body[0].props.browse.containers),
  // 旧形式: init.preparations.body.containers
  z
    .object({
      init: z.object({
        preparations: z.object({ body: z.object({ containers: ContainersSchema }) }).optional()
      })
    })
    .transform((v) => (v.init.preparations === undefined ? [] : v.init.preparations.body.containers))
])

export type PaginateParams = {
  paginationTargetId: string
  serviceToken: string
}

export const PaginateResponseSchema = z.object({
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

export type PaginateResponse = z.infer<typeof PaginateResponseSchema>

// --- Detail page embedded JSON schemas ---

/** 詳細ページ HTML の headerDetail セクション。タイトル・あらすじ・エンティティタイプ・レーティングを含む。 */
const DetailHeaderSchema = z
  .object({
    title: z.string().nonempty(),
    synopsis: z.string().nonempty(),
    entityType: EntityTypeEnum,
    images: z
      .object({
        covershot: z.string().optional(),
        titleshot: z.string().optional(),
        packshot: z.string().optional()
      })
      .transform((v) => v.covershot || v.titleshot || v.packshot || ''),
    ratingBadge: z.object({
      displayText: z.string().nonempty()
    })
  })
  .transform((v) => ({
    ...v,
    imageUrl: v.images,
    maturityRating: (() => {
      const match = v.ratingBadge.displayText.match(/(\d+)/)
      return match ? Number.parseInt(match[1], 10) : null
    })()
  }))

/** 詳細ページ HTML のシーズンエントリ。シーズン選択 UI に使用。 */
const DetailSeasonEntrySchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  sequenceNumber: z.number().int().positive()
})

const EpisodePageTokenSchema = z.object({
  token: z.string().nonempty().optional()
})

const DetailAtfStateSchema = z.object({
  detail: z.object({
    headerDetail: z.record(z.string().nonempty(), DetailHeaderSchema)
  }),
  seasons: z.record(z.string(), z.array(DetailSeasonEntrySchema).nonempty())
})

const DetailBtfStateSchema = z.object({
  episodeList: z.object({
    actions: z
      .object({
        episodePages: z.array(EpisodePageTokenSchema).nonempty()
      })
      .default({ episodePages: [] })
  })
})

/** `extractPageData` が返すページデータ。detail.ts 内で TitleInfo 構築に使用。 */
export const PageDataSchema = z.object({
  title: z.string().nonempty(),
  synopsis: z.string().nonempty(),
  entityType: EntityType,
  maturityRating: z.number().int().positive().nullable(),
  imageUrl: z.url(),
  seasons: z.array(
    z.object({
      seasonId: z.string().nonempty(),
      displayName: z.string().nonempty(),
      seasonNumber: z.number().int().positive()
    })
  ),
  episodePageTokens: z.array(z.string().nonempty())
})
export type PageData = z.infer<typeof PageDataSchema>

/** atf/btf を含む body 部分のスキーマ */
const DetailBodySchema = z.object({
  atf: z.object({ state: DetailAtfStateSchema }),
  btf: z.object({ state: DetailBtfStateSchema })
})

/** atf/btf からフラットな PageData に変換する */
function transformDetailBody(body: z.infer<typeof DetailBodySchema>) {
  const { atf, btf } = body

  const headerDetail = Object.values(atf.state.detail.headerDetail)[0]
  if (!headerDetail) throw new Error('Parse failed: headerDetail not found')

  const rawSeasons = Object.values(atf.state.seasons ?? {})[0] ?? []
  const episodePages = btf.state.episodeList.actions.episodePages

  return {
    title: headerDetail.title,
    synopsis: headerDetail.synopsis,
    entityType: headerDetail.entityType,
    maturityRating: headerDetail.maturityRating,
    imageUrl: headerDetail.imageUrl,
    seasons: rawSeasons
      .map((s) => ({ seasonId: s.seasonId, displayName: s.displayName, seasonNumber: s.sequenceNumber }))
      .sort((a, b) => a.seasonNumber - b.seasonNumber),
    episodePageTokens: episodePages.map((p) => p.token).filter((t): t is string => t !== undefined)
  }
}

/** 詳細ページ `<script type="text/template">` の全体構造。`extractPageData` で使用。transform でフラットな構造に変換。 */
export const DetailPageJsonSchema = z
  .union([
    // 新形式: props.body[].props.{atf,btf}
    z
      .object({
        props: z.object({
          body: z.array(z.object({ props: DetailBodySchema })).nonempty()
        })
      })
      .transform((v) => transformDetailBody(v.props.body[0].props)),
    // 旧形式: init.preparations.body.{atf,btf}
    z
      .object({
        init: z.object({
          preparations: z.object({ body: DetailBodySchema })
        })
      })
      .transform((v) => transformDetailBody(v.init.preparations.body))
  ])
  .pipe(PageDataSchema)
