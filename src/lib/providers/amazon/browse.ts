import { type BrowseQuery, BrowseQuerySchema } from '../../../schemas/providers/amazon.dto'
import { encodeBytes, encodeString, encodeVarintField } from './protobuf'

const AMAZON_BROWSE_BASE = 'https://www.amazon.co.jp/gp/video/browse/ref=atv_dp_pd_gen'

/**
 * オファータイプごとの固定パラメータ。
 *
 * | offer   | qs-offer_type | field-ways_to_watch | pv_browse_internal_offer |
 * |---------|---------------|---------------------|--------------------------|
 * | svod    | 1             | 3746330051          | svod                     |
 * | tvod    | 2             | 3746332051          | tvod                     |
 * | subscription | 3        | 2                   | subscription             |
 */
const OFFER_PARAMS = {
  svod: { offerType: '1', waysToWatch: '3746330051', internalOffer: 'svod' },
  tvod: { offerType: '2', waysToWatch: '3746332051', internalOffer: 'tvod' },
  subscription: { offerType: '3', waysToWatch: '2', internalOffer: 'subscription' }
} as const

type OfferType = keyof typeof OFFER_PARAMS

export interface BuildOptions {
  sort?: boolean
  /** オファータイプ (デフォルト: 'svod') */
  offer?: OfferType
  /** kids ジャンルを除外する (デフォルト: offer が tvod/subscription のとき true) */
  excludeKids?: boolean
  /** サブスクリプションID (例: 'danime')。指定時は field-subscription_id を追加 */
  subscriptionId?: string
  /** ベネフィットID (例: 'danime')。指定時は pv_browse_internal_benefit を追加 */
  benefit?: string
  /** bq フィルタを上書きする。未指定時はアニメジャンル用のデフォルトを使用 */
  bq?: string
  /** field-genre-bin を追加する (デフォルト: false) */
  genreBin?: boolean
  /** カテゴリノード (例: '2351649051' = アニメ) */
  node?: string
  /** ソート値を上書きする (デフォルト: 'pv-public-release-date-desc-rank') */
  sortValue?: string
  /** 新着アニメTVフィルタを適用する */
  newAnime?: boolean
}

/**
 * アニメジャンル検索用の bq (boolean query) フィルタ文字列を組み立てる。
 * @param excludeKids - true の場合、kids ジャンルを除外する
 * @returns CloudSearch bq フィルタ文字列
 */
function buildBqFilter(excludeKids: boolean): string {
  const genreOr = "or genre:'av_genre_anime' genre:'av_subgenre_anime*' genre:'av_genre_animation_adult_interest'"
  const innerClauses = [`(${genreOr})`]
  if (excludeKids) {
    innerClauses.push("(not genre:'kids')")
  }
  const inner = innerClauses.length > 1 ? `(and ${innerClauses.join(' ')})` : innerClauses[0]
  return `(and ${inner} (not entity_type:'Promotion|Trailer|Bonus Content'))`
}

/**
 * ブラウズ API の URL クエリパラメータ文字列を組み立てる。
 *
 * オファータイプ・ジャンルフィルタ・ソート順等を組み合わせて
 * serviceToken 内に埋め込む検索パラメータを生成する。
 * @param query - 検索キーワードと検索エイリアス
 * @param options - オファータイプ、ソート、フィルタ等のオプション
 * @returns URL エンコード済みのクエリパラメータ文字列
 */
export function buildSearchParams(query: BrowseQuery, options?: BuildOptions): string {
  const offer = options?.offer ?? 'svod'
  const params = OFFER_PARAMS[offer]
  const excludeKids = options?.excludeKids ?? true
  const hasBenefit = !!options?.subscriptionId

  const entries: [string, string][] = []

  if (options?.node) entries.push(['node', options.node])
  entries.push(['qs-country-code', 'JP'])
  if (options?.newAnime) {
    // 新着アニメTV カテゴリのフィルタ
    entries.push(['p_n_theme_browse-bin', '4435524051'])
    entries.push(['p_n_subscription_id', '5602560051|10387742051'])
  }
  if (options?.sort ?? true) entries.push(['sort', options?.sortValue ?? 'pv-public-release-date-desc-rank'])
  entries.push(['field-ways_to_watch', params.waysToWatch])
  if (options?.subscriptionId) entries.push(['field-subscription_id', options.subscriptionId])
  if (options?.genreBin) entries.push(['field-genre-bin', 'av_genre_anime'])
  entries.push(['search-alias', query.searchAlias])
  entries.push(['bq', options?.bq ?? buildBqFilter(excludeKids)])
  entries.push(['qs-offer_type', params.offerType])
  if (options?.newAnime) {
    entries.push(['is_movie_collection', '0,0,0,0'])
  }
  if (!hasBenefit) entries.push(['p_n_entity_type', '4174099051'])
  if (options?.newAnime) {
    entries.push(['p_n_feature_six_browse-bin', '5871472051'])
  }
  if (!options?.newAnime) {
    entries.push(['adult-product', '0'])
    entries.push(['pv_browse_internal_offer', params.internalOffer])
    if (options?.benefit) entries.push(['pv_browse_internal_benefit', options.benefit])
    entries.push(['pv_browse_internal_language', 'all'])
  }

  // スペースを %20 でエンコード（+ ではなく）
  return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
}

/**
 * serviceToken 内の field 16 に埋め込むネストメッセージを組み立てる。
 * @param query - 検索クエリパラメータ
 * @param options - ビルドオプション
 * @returns protobuf エンコードされたバイト配列
 */
function buildNestedMessage(query: BrowseQuery, options?: BuildOptions): number[] {
  return [
    ...encodeString(3, buildSearchParams(query, options)),
    ...encodeString(4, query.keyword),
    ...encodeVarintField(6, 0),
    ...encodeVarintField(10, 0),
    ...encodeVarintField(14, 0)
  ]
}

/**
 * Prime Video ブラウズ API 用の serviceToken を生成する。
 *
 * 検索クエリを protobuf でエンコードし、URL-safe Base64 に変換する。
 * @param query - 検索クエリパラメータ
 * @param options - ビルドオプション
 * @returns URL-safe Base64 エンコードされた serviceToken 文字列
 */
export function buildServiceToken(query: BrowseQuery, options?: BuildOptions): string {
  const proto = [
    ...encodeString(2, 'query'),
    ...encodeVarintField(3, 1),
    ...encodeString(5, 'default'),
    ...encodeString(6, 'center'),
    ...encodeString(7, 'search'),
    ...encodeString(15, ''),
    ...encodeBytes(16, buildNestedMessage(query, options))
  ]

  const bytes = new Uint8Array(proto)
  // btoa works in both Cloudflare Workers and Node 18+
  const b64 = btoa(String.fromCharCode(...bytes))
  // URL-safe base64
  return b64.replace(/\+/g, '-').replace(/\//g, '_')
}

/**
 * Prime Video のアニメ一覧ブラウズ URL を生成する。
 *
 * @example
 * ```ts
 * // デフォルト (アニメ一覧)
 * const url = buildAmazonBrowseUrl()
 *
 * // カスタムパラメータ
 * const url = buildAmazonBrowseUrl({ keyword: 'SF', genre: 'av_genre_sci_fi' })
 * ```
 */
export function buildAmazonBrowseUrl(params?: Partial<BrowseQuery>, options?: BuildOptions): string {
  const query = BrowseQuerySchema.parse(params ?? {})
  const token = buildServiceToken(query, options)
  return `${AMAZON_BROWSE_BASE}?serviceToken=v0_${encodeURIComponent(token)}`
}
