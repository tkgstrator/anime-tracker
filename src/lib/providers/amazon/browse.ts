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
  /** 配信終了間近フィルタを適用する */
  expiring?: boolean
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
function buildSearchParams(query: BrowseQuery, options?: BuildOptions): string {
  const offer = options?.offer ?? 'svod'
  const params = OFFER_PARAMS[offer]
  const excludeKids = options?.excludeKids ?? true
  const entries: [string, string][] = []

  if (options?.expiring) {
    // 配信終了間近フィルタ: アニメノード + svod + theme_browse-bin で絞り込み
    entries.push(['node', '4217520051'])
    entries.push(['is_movie_collection', '0,0'])
    entries.push(['p_n_ways_to_watch', params.waysToWatch])
    entries.push(['search-alias', query.searchAlias])
    entries.push([
      'bq',
      "(and (not entity_type:'Promotion|Trailer|Bonus Content') (not entity_type:'Promotion|Trailer|Bonus Content'))"
    ])
    entries.push(['bbn', '4217520051'])
    entries.push(['p_n_theme_browse-bin', '4435524051'])
    return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  }

  if (options?.newAnime) {
    // 新着アニメ: アニメジャンル + svod + 新着順
    const bq =
      "(and (and (and (and (and (or genre:'av_genre_anime' genre:'av_subgenre_anime*') " +
      "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
      "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
      "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
      "(not entity_type:'Promotion|Trailer|Bonus Content')) " +
      "(not entity_type:'Promotion|Trailer|Bonus Content'))"
    // entries.push(['p_n_theme_browse-bin', '4435524051'])
    entries.push(['is_movie_collection', '0,0,0,0,0'])
    entries.push(['sort', '-prime_video_start_date'])
    entries.push(['field-ways_to_watch', params.waysToWatch])
    entries.push(['search-alias', query.searchAlias])
    entries.push(['bq', bq])
    // entries.push(['p_n_ways_to_watch', '3746328051'])
    return entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')
  }

  if (options?.node) entries.push(['node', options.node])
  entries.push(['qs-country-code', 'JP'])
  if (options?.sort ?? true) entries.push(['sort', options?.sortValue ?? 'pv-public-release-date-desc-rank'])
  entries.push(['field-ways_to_watch', params.waysToWatch])
  if (options?.subscriptionId) entries.push(['field-subscription_id', options.subscriptionId])
  if (options?.genreBin) entries.push(['field-genre-bin', 'av_genre_anime'])
  entries.push(['search-alias', query.searchAlias])
  entries.push(['bq', options?.bq ?? buildBqFilter(excludeKids)])
  entries.push(['qs-offer_type', params.offerType])
  entries.push(['adult-product', '0'])
  entries.push(['pv_browse_internal_offer', params.internalOffer])
  if (options?.benefit) entries.push(['pv_browse_internal_benefit', options.benefit])
  entries.push(['pv_browse_internal_language', 'all'])

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
    ...encodeString(2, options?.expiring ? 'filter' : 'query'),
    ...encodeVarintField(3, 1),
    ...(options?.expiring ? [] : encodeString(5, 'default')),
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

/**
 * ページネーション用の serviceToken を自前で生成する。
 *
 * ブラウズページの HTML をパースせずに、protobuf エンコードした
 * ページネーショントークンを直接生成できる。Cookie さえあれば
 * startIndex を変えて全ページを並列取得可能。
 *
 * @param options - ビルドオプション（検索パラメータの決定に使用）
 * @returns `v0_` プレフィックス付きの URL-safe Base64 トークン
 */
export function buildPaginationToken(options?: BuildOptions): string {
  const query = BrowseQuerySchema.parse({})
  const searchParams = buildSearchParams(query, options)
  const cursor = JSON.stringify({ sbsin: 0, cursize: 0, presize: 0 })

  const nested = [
    ...encodeString(3, searchParams),
    ...encodeString(4, ''),
    ...encodeVarintField(6, 0),
    ...encodeString(7, cursor),
    ...encodeVarintField(10, 20),
    ...encodeVarintField(14, 0)
  ]

  const proto = [
    ...encodeString(2, 'hpage'),
    ...encodeVarintField(3, 0),
    ...encodeString(4, 'browse'),
    ...encodeString(5, 'default'),
    ...encodeString(6, 'center'),
    ...encodeString(7, 'search'),
    ...encodeString(15, ''),
    ...encodeBytes(16, nested)
  ]

  const bytes = new Uint8Array(proto)
  const b64 = btoa(String.fromCharCode(...bytes))
  return `v0_${b64.replace(/\+/g, '-').replace(/\//g, '_')}`
}
