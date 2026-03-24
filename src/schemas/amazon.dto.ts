import { z } from 'zod'
import { TitleSchema } from './provider.dto'

/** ブラウズページの entity.entityType に含まれるコンテンツ種別。 */
export const AmazonBrowseEntityTypeSchema = z.enum(['TV Show', 'Movie', 'Educational', 'Short Film'])
export type AmazonBrowseEntityType = z.infer<typeof AmazonBrowseEntityTypeSchema>

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
    entityType: AmazonBrowseEntityTypeSchema,
    images: z.object({
      cover: z.object({ url: z.url() })
    }),
    entitlementCues: z.object({
      titleMetadataBadge: z.object({ message: z.string().nonempty() })
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
      preparation: z
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
  .transform((v) => v.init.preparation?.body.containers.flatMap((v) => v.entities))
