import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'
import { parse as parseHtml } from 'node-html-parser'

dayjs.extend(utc)
dayjs.extend(timezone)

import { z } from 'zod'
import { parseExpiringMessage } from '../../lib/providers/amazon/expiring'
import { type BadgeType, EntityType, EpisodeSchema, stripQueryParams, TitleSchema } from './common.dto'

/** Amazon 画像 URL からディレクティブ付き装飾を除去する */
const AmazonImageUrlSchema = z.string().transform((url) => {
  const m = url.match(/\/([0-9a-f]{64})[._]/)
  if (!m) return url
  const ext = url.match(/\.(jpg|png)\s*$/)?.[1] ?? 'jpg'
  return `https://m.media-amazon.com/images/S/pv-target-images/${m[1]}.${ext}`
})

/** Amazon の entityType 文字列を共通の EntityType にマッピングする */
const AmazonEntityType = z
  .enum(['TV Show', 'Movie', 'Educational', 'Short Film', 'Unknown'])
  .transform((v) => (v === 'Movie' ? EntityType.enum.movie : EntityType.enum.tv))

// --- Browse schemas ---

export const BrowseQuerySchema = z.object({
  keyword: z.string().default(''),
  searchAlias: z.string().default('instant-video')
})
export type BrowseQuery = z.infer<typeof BrowseQuerySchema>

export const BrowseEntitySchema = z
  .object({
    titleID: z.string().nonempty(),
    displayTitle: z.string().nonempty(),
    synopsis: z.string().nonempty(),
    entityType: AmazonEntityType,
    images: z.object({
      cover: z.object({ url: z.url().pipe(AmazonImageUrlSchema) })
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
    const badgeMsg = v.entitlementCues.titleMetadataBadge.message
    const badge: BadgeType | undefined =
      badgeMsg === '新エピソード'
        ? 'NEW_EPISODE'
        : badgeMsg === '新着' || badgeMsg === '新作'
          ? 'RECENTLY_ADDED'
          : undefined
    const result = TitleSchema.safeParse({
      contentId: v.titleID,
      title: v.displayTitle,
      description: v.synopsis,
      entityType: v.entityType,
      imageUrl: v.images.cover.url,
      maturityRating: null,
      badge,
      expiring: parsed ? { remainingHours: parsed.remainingHours, season: parsed.season } : undefined
    })
    if (!result.success) throw result.error
    return result.data
  })

const ContainersSchema = z
  .array(z.object({ entities: z.array(BrowseEntitySchema).nonempty() }))
  .nonempty()
  .transform((containers) => containers.flatMap((c) => c.entities))

export const BrowseHTMLSchema = z.union([
  z
    .object({
      props: z.object({
        body: z.array(z.object({ props: z.object({ browse: z.object({ containers: ContainersSchema }) }) })).nonempty()
      })
    })
    .transform((v) => v.props.body[0].props.browse.containers),
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

// --- getDetailWidgets API schemas ---

/** 「2024年1月5日」形式の日本語日付文字列を ISO 8601 UTC に変換する。元データは JST。 */
const JapaneseDateSchema = z
  .string()
  .default('')
  .transform((dateStr) => {
    const m = dateStr.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (!m) return ''
    return dayjs.tz(`${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`, 'Asia/Tokyo').toISOString()
  })

/** エピソードの action オブジェクトから benefitId を抽出する */
function extractBenefitId(action: unknown): string | null {
  const json = JSON.stringify(action ?? {})
  const m = json.match(/"benefitId"\s*:\s*"([^"]+)"/)
  return m?.[1]?.toLowerCase() ?? null
}

const EpisodeDetailSchema = z.object({
  episodeNumber: z.number().int().nonnegative().optional(),
  title: z.string().optional(),
  synopsis: z.string().optional(),
  isPrime: z.boolean().optional(),
  releaseDate: JapaneseDateSchema,
  duration: z.number().nonnegative().default(0),
  runtime: z.string().optional(),
  images: z
    .object({
      covershot: z.string().optional(),
      titleshot: z.string().optional()
    })
    .optional(),
  subtitles: z.array(z.string()).default([]),
  audioTracks: z.array(z.string()).default([])
})

const WidgetEpisodeSchema = z
  .object({
    titleID: z.string().nonempty(),
    detail: EpisodeDetailSchema,
    action: z.unknown().optional(),
    metadata: z
      .object({
        maturityRating: z.object({ displayText: z.string().optional() }).optional()
      })
      .optional()
  })
  .transform((ep) => {
    const d = ep.detail
    const ratingMatch = ep.metadata?.maturityRating?.displayText?.match(/(\d+)/)
    return {
      episodeNumber: d.episodeNumber ?? 0,
      episodeId: ep.titleID,
      title: d.title ?? '',
      description: d.synopsis ? parseHtml(d.synopsis).textContent : '',
      releaseDate: d.releaseDate || dayjs().toISOString(),
      duration: d.duration,
      maturityRating: ratingMatch ? Number.parseInt(ratingMatch[1], 10) : null,
      imageUrl: d.images?.covershot || d.images?.titleshot || '',
      hasSubtitles: d.subtitles.length > 0,
      hasDub: d.audioTracks.length > 1,
      benefitId: extractBenefitId(ep.action)
    }
  })
  .pipe(EpisodeSchema)

export const WidgetResponseSchema = z
  .object({
    widgets: z
      .object({
        episodeList: z.object({ episodes: z.array(WidgetEpisodeSchema).default([]) }).optional()
      })
      .optional()
  })
  .transform((data) => data.widgets?.episodeList?.episodes ?? [])

// --- Detail page schemas ---

const HeaderSchema = z
  .object({
    title: z.string().nonempty(),
    synopsis: z.string().nonempty(),
    entityType: AmazonEntityType,
    images: z
      .object({
        covershot: z.string().nonempty(),
        titleshot: z.string().nonempty(),
        packshot: z.string().nonempty()
      })
      .transform((v) => v.covershot)
      .pipe(AmazonImageUrlSchema),
    ratingBadge: z.object({ displayText: z.string().nonempty() }),
    subtitles: z.array(z.string()).default([]),
    audioTracks: z.array(z.string()).default([]),
    duration: z.number().nonnegative().optional(),
    releaseDate: JapaneseDateSchema
  })
  .transform((v) => ({
    title: v.title,
    synopsis: v.synopsis,
    entityType: v.entityType,
    imageUrl: v.images,
    maturityRating: (() => {
      const match = v.ratingBadge.displayText.match(/(\d+)/)
      return match ? Number.parseInt(match[1], 10) : null
    })(),
    hasSubtitles: v.subtitles.length > 0,
    hasDub: v.audioTracks.length > 1,
    duration: v.duration,
    releaseDate: v.releaseDate
  }))

const SeasonEntrySchema = z.object({
  seasonId: z.string().nonempty(),
  displayName: z.string().nonempty(),
  sequenceNumber: z.number().int().positive()
})

export const PageDataSchema = z.object({
  title: z.string().nonempty(),
  synopsis: z.string().nonempty(),
  entityType: EntityType,
  maturityRating: z.number().int().positive().nullable(),
  imageUrl: z.url().transform(stripQueryParams),
  hasSubtitles: z.boolean(),
  hasDub: z.boolean(),
  duration: z.number().nonnegative().optional(),
  releaseDate: z.string().optional(),
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

const DetailBodySchema = z
  .object({
    atf: z.object({
      state: z.object({
        detail: z.object({
          headerDetail: z
            .record(z.string().nonempty(), HeaderSchema)
            .refine((v) => Object.keys(v).length > 0, 'headerDetail must have at least one entry')
            .transform((v) => Object.values(v)[0])
        }),
        seasons: z
          .record(z.string(), z.array(SeasonEntrySchema).nonempty())
          .default({})
          .transform((v) =>
            (Object.values(v)[0] ?? [])
              .map((s) => ({ seasonId: s.seasonId, displayName: s.displayName, seasonNumber: s.sequenceNumber }))
              .sort((a, b) => a.seasonNumber - b.seasonNumber)
          )
      })
    }),
    btf: z.object({
      state: z.object({
        episodeList: z.object({
          actions: z
            .object({ episodePages: z.array(z.object({ token: z.string().nonempty().optional() })).nonempty() })
            .default({ episodePages: [] })
            .transform((v) => v.episodePages.map((p) => p.token).filter((t): t is string => t !== undefined))
        })
      })
    })
  })
  .transform((body): PageData => {
    const hd = body.atf.state.detail.headerDetail
    const result = PageDataSchema.safeParse({
      ...hd,
      seasons: body.atf.state.seasons,
      episodePageTokens: body.btf.state.episodeList.actions
    })
    if (!result.success) throw result.error
    return result.data
  })

export const DetailPageJsonSchema = z
  .union([
    z
      .object({
        props: z.object({
          body: z.array(z.object({ props: DetailBodySchema })).nonempty()
        })
      })
      .transform((v) => v.props.body[0].props),
    z
      .object({
        init: z.object({
          preparations: z.object({ body: DetailBodySchema })
        })
      })
      .transform((v) => v.init.preparations.body)
  ])
  .pipe(PageDataSchema)
