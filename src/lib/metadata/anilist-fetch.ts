/**
 * AniList GraphQL API から年単位で anime media を取得する pure HTTP 層。
 *
 * DB アクセスや side-effect は持たず、入力 (year/page/country) → 出力 (entries) のみ。
 * scripts (bun:sqlite) と Workers Queue consumer (Prisma) の両方から再利用される。
 */
const ANILIST_API = 'https://graphql.anilist.co'
const PER_PAGE = 50

export const ANILIST_QUERY = `query ($year: Int, $page: Int, $perPage: Int, $country: CountryCode) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage }
    media(type: ANIME, seasonYear: $year, countryOfOrigin: $country) {
      id
      title { native romaji english }
      season
      seasonYear
      status
      startDate { year month }
    }
  }
}`

export interface AniListEntry {
  id: number
  title: { native: string | null; romaji: string | null; english: string | null }
  season: string | null
  seasonYear: number | null
  status: string | null
  startDate: { year: number | null; month: number | null }
}

export interface FetchPageResult {
  hasNextPage: boolean
  media: AniListEntry[]
}

/** AniList Page クエリを 1 回叩く。429 は Retry-After を見て自動リトライ */
export async function fetchAnilistYearPage(
  year: number,
  page: number,
  country: string,
  retries = 3
): Promise<FetchPageResult> {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      query: ANILIST_QUERY,
      variables: { year, page, perPage: PER_PAGE, country }
    })
  })

  if (res.status === 429 && retries > 0) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? '5')
    await new Promise((r) => setTimeout(r, retryAfter * 1000))
    return fetchAnilistYearPage(year, page, country, retries - 1)
  }
  if (!res.ok) {
    throw new Error(`AniList ${res.status}: ${await res.text().catch(() => '')}`)
  }

  const json = (await res.json()) as {
    data?: { Page: { pageInfo: { hasNextPage: boolean }; media: AniListEntry[] } }
    errors?: unknown
  }
  if (!json.data) throw new Error(`AniList error: ${JSON.stringify(json.errors)}`)
  return { hasNextPage: json.data.Page.pageInfo.hasNextPage, media: json.data.Page.media }
}
