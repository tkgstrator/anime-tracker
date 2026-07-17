/**
 * `/identify` ハンドラ。
 * 与えられた raw タイトル文字列を cleanTitle で正規化して AniList にバッチ検索し、
 * native title / status / year / quarter を返す。
 */
import type { z } from 'zod'
import { cleanTitle } from '../../../src/lib/metadata/anilist'
import type { IdentifyResponseSchema } from '../../../src/schemas/lambda.dto'
import { MetadataMediaSchema } from '../../../src/schemas/providers/metadata.dto'
import { fetchWithRetry } from '../http'
import { logger } from '../logger'

/** AniList GraphQL エンドポイント。 */
const ANILIST_API = 'https://graphql.anilist.co'

/** AniList GraphQL の Media から取得したいフィールド。 */
const MEDIA_FIELDS = `
  id
  title { native }
  countryOfOrigin
  status
  season
  seasonYear
  startDate { year month day }
`

/** AniList season → 四半期 (0..3) 変換テーブル。WINTER=Q1, SPRING=Q2, SUMMER=Q3, FALL=Q4。 */
const SEASON_TO_QUARTER: Record<string, number> = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  FALL: 3
}

/** startDate.month (1..12) → 四半期 (0..3) 変換テーブル。season が空の場合の fallback。 */
const MONTH_TO_QUARTER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] as const

/**
 * 複数タイトルの AniList 検索を 1 リクエストにバッチする GraphQL クエリを構築する。
 * `q0` .. `qN-1` の alias に各検索が結び付く。
 */
function buildBatchQuery(searches: string[]): string {
  const fragments = searches.map(
    (search, i) =>
      `q${i}: Page(perPage: 5) { media(search: ${JSON.stringify(search)}, type: ANIME) { ${MEDIA_FIELDS} } }`
  )
  return `query { ${fragments.join('\n')} }`
}

/** identifyTitles の戻り値。 upstream が 4xx/5xx を返した場合は kind='upstream_error'。 */
export type IdentifyOutcome =
  | { kind: 'ok'; results: (z.infer<typeof IdentifyResponseSchema>['results'][number])[] }
  | { kind: 'upstream_error'; upstreamStatus: number }

/**
 * AniList でタイトルを検索し、native title / status / year / quarter を返す。
 * ヒット無し・schema 不一致・year/quarter 特定不可の要素は null で返す。
 *
 * @param rawTitles  検索対象の raw title 文字列。cleanTitle で正規化してから検索する。
 * @returns kind='ok' の場合は入力順に results、kind='upstream_error' の場合は upstream の status。
 */
export async function identifyTitles(rawTitles: string[]): Promise<IdentifyOutcome> {
  if (rawTitles.length === 0) return { kind: 'ok', results: [] }

  const searches = rawTitles.map((t) => cleanTitle(t))
  const query = buildBatchQuery(searches)

  const res = await fetchWithRetry(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query })
  })

  if (!res.ok) {
    logger.error({ action: 'anilist-error', status: res.status })
    return { kind: 'upstream_error', upstreamStatus: res.status }
  }

  const data = (await res.json()) as { data: Record<string, { media: unknown[] }> }

  const results = searches.map((_, i) => {
    const page = data.data[`q${i}`]
    if (!page?.media?.length) return null
    const parsed = MetadataMediaSchema.safeParse(page.media[0])
    if (!parsed.success) {
      logger.warn({ action: 'identify-schema-mismatch', index: i, error: parsed.error.message })
      return null
    }
    const media = parsed.data

    const year = media.seasonYear ?? media.startDate.year
    const quarter = media.season
      ? SEASON_TO_QUARTER[media.season]
      : media.startDate.month
        ? MONTH_TO_QUARTER[media.startDate.month - 1]
        : null
    if (year == null || quarter == null) return null

    return {
      aniListId: media.id,
      title: media.title.native,
      status: media.status,
      year,
      quarter
    }
  })

  logger.info({
    action: 'identify',
    total: rawTitles.length,
    matched: results.filter(Boolean).length
  })
  return { kind: 'ok', results }
}
