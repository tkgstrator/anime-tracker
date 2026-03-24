/**
 * AniListでクリーン済みタイトルを検索し、episode数を取得する実験スクリプト
 */

const ANILIST_URL = 'https://graphql.anilist.co'

interface AniListMedia {
  id: number
  title: { romaji: string; native: string | null }
  episodes: number | null
  format: string
  season: string | null
  seasonYear: number | null
}

async function searchAniList(query: string): Promise<AniListMedia | null> {
  const gql = `query ($search: String) {
    Media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA, OVA, SPECIAL]) {
      id
      title { romaji native }
      episodes
      format
      season
      seasonYear
    }
  }`
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: { Media?: AniListMedia } }
  return data.data?.Media ?? null
}

function cleanTitle(title: string): string {
  return title
    .replace(/\s*シーズン\d+.*/, '')
    .replace(/\s*Season\s*\d+.*/i, '')
    .replace(/\s*第?\d+期.*/, '')
    .replace(/\s*Part\s*\d+.*/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[「」『』]/g, '')
    .replace(/\s*#\d+\s.*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// SKIPケースを実際のepisodes.jsonから取得して検証
const CACHE_DIR = '.cache'

interface Episode { episodeNumber: number; [key: string]: unknown }
interface Season { seasonNumber: number; seasonId: string; episodes: Episode[]; [key: string]: unknown }
interface Title { contentId: string; title: string; tmdbId?: number | null; seasons: Season[]; [key: string]: unknown }

async function searchWithFallback(title: string): Promise<AniListMedia | null> {
  // まず元タイトルで検索
  const result = await searchAniList(title)
  if (result) return result

  // ダメならclean版で
  const cleaned = cleanTitle(title)
  if (cleaned !== title) {
    await new Promise((r) => setTimeout(r, 700))
    return searchAniList(cleaned)
  }
  return null
}

const providers = ['amazon', 'hulu'] as const
let totalGroups = 0
let fullMatch = 0
let partialMatch = 0
let noMatch = 0

for (const provider of providers) {
  const inputPath = `__tests__/fixtures/${provider}/episodes.json`
  const file = Bun.file(inputPath)
  if (!(await file.exists())) continue

  const titles: Title[] = await file.json()

  // mappingからtmdbIdを付与
  const mappingFile = Bun.file(`${CACHE_DIR}/${provider}/mapping.json`)
  const mapping: Record<string, number | null> = (await mappingFile.exists()) ? await mappingFile.json() : {}
  for (const title of titles) {
    if (typeof title.tmdbId !== 'number' && title.contentId in mapping) {
      title.tmdbId = mapping[title.contentId]
    }
  }

  // tmdbIdでグループ化 → SKIPケースのみ
  const tmdbGroups = new Map<number, Title[]>()
  for (const title of titles) {
    if (typeof title.tmdbId !== 'number') continue
    const group = tmdbGroups.get(title.tmdbId)
    if (group) group.push(title)
    else tmdbGroups.set(title.tmdbId, [title])
  }

  // 最初の20 SKIPグループだけテスト
  let tested = 0
  for (const [tmdbId, group] of tmdbGroups) {
    if (group.length <= 1) continue
    const allSeasonNumbers = group.flatMap((t) => t.seasons.map((s) => s.seasonNumber))
    if (new Set(allSeasonNumbers).size === allSeasonNumbers.length) continue
    if (tested >= 20) break
    tested++
    totalGroups++

    console.log(`\n${'─'.repeat(60)}`)
    console.log(`[${provider}] tmdbId=${tmdbId} — ${group.length} titles`)

    const results: { title: Title; anilist: AniListMedia | null; epCount: number }[] = []
    for (const title of group) {
      const epCount = title.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
      const anilist = await searchWithFallback(title.title)
      results.push({ title, anilist, epCount })

      if (anilist) {
        const epMatch = anilist.episodes === epCount ? '✓' : (anilist.episodes !== null ? `≠${anilist.episodes}` : '?')
        console.log(`  "${title.title}" (${epCount}eps) → AniList: "${anilist.title.native ?? anilist.title.romaji}" ${anilist.episodes ?? '?'}eps ${epMatch}`)
      } else {
        console.log(`  "${title.title}" (${epCount}eps) → NOT FOUND`)
      }
      await new Promise((r) => setTimeout(r, 700))
    }

    // 結果判定: AniList IDがすべてユニークか
    const anilistIds = results.filter((r) => r.anilist).map((r) => r.anilist!.id)
    const uniqueIds = new Set(anilistIds)
    const allFound = results.every((r) => r.anilist !== null)

    if (allFound && uniqueIds.size === results.length) {
      console.log(`  ✓ FULL: 全タイトルがユニークなAniListエントリに対応`)
      fullMatch++
    } else if (uniqueIds.size > 1) {
      console.log(`  △ PARTIAL: ${uniqueIds.size}/${results.length} ユニーク`)
      partialMatch++
    } else {
      console.log(`  ✗ 同一AniListエントリ or NOT FOUND`)
      noMatch++
    }
  }
}

console.log(`\n${'='.repeat(60)}`)
console.log(`Summary (first 20 groups per provider):`)
console.log(`  Total:   ${totalGroups}`)
console.log(`  Full:    ${fullMatch}`)
console.log(`  Partial: ${partialMatch}`)
console.log(`  None:    ${noMatch}`)
