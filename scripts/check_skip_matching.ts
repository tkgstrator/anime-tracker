/**
 * SKIP(dupSeason)ケースでTMDBシーズン名とのタイトル類似度マッチングを検証するスクリプト
 */

const CACHE_DIR = '.cache'
const TMDB_CACHE_DIR = `${CACHE_DIR}/tmdb`

interface TmdbSeason {
  seasonNumber: number
  displayName: string
  episodes: unknown[]
}

interface TmdbMeta {
  title: string
  description: string
  episodes: { seasons: TmdbSeason[] }
}

interface Episode {
  episodeNumber: number
  [key: string]: unknown
}

interface Season {
  seasonNumber: number
  seasonId: string
  episodes: Episode[]
  [key: string]: unknown
}

interface Title {
  contentId: string
  title: string
  tmdbId?: number | null
  seasons: Season[]
  [key: string]: unknown
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

/** 全角半角正規化 + 記号除去 */
function normalize(s: string): string {
  return s
    // 全角英数→半角
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 全角スペース→半角
    .replace(/\u3000/g, ' ')
    // 装飾除去
    .replace(/[『』「」【】〈〉《》]/g, '')
    .replace(/[（）\(\)]/g, '')
    // 記号正規化
    .replace(/[～〜]/g, '~')
    .replace(/[ー－―‐]/g, '-')
    .replace(/[・]/g, '')
    // ハイフン周りのスペースを統一（スペースなしに）
    .replace(/\s*-\s*/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/** Amazonタイトルからシーズン番号を抽出 */
function extractSeasonNumber(title: string): number | null {
  const patterns = [
    /Season\s*(\d+)/i,
    /シーズン\s*(\d+)/,
    /第(\d+)期/,
    /(\d+)期$/,
    /\s+(\d+)$/,  // タイトル末尾の数字
  ]
  for (const p of patterns) {
    const m = title.match(p)
    if (m) return parseInt(m[1])
  }
  return null
}

/** TMDBシーズン名からシーズン番号を抽出 */
function extractTmdbSeasonNumber(displayName: string): number | null {
  const patterns = [
    /シーズン\s*(\d+)/,
    /Season\s*(\d+)/i,
    /第(\d+)期/,
    /(\d+)期$/,
  ]
  for (const p of patterns) {
    const m = displayName.match(p)
    if (m) return parseInt(m[1])
  }
  return null
}

/** タイトル類似度 */
function titleSimilarity(amazonTitle: string, tmdbSeasonName: string): number {
  const a = normalize(cleanTitle(amazonTitle))
  const b = normalize(tmdbSeasonName)

  if (a === b) return 1.0
  if (a.includes(b) || b.includes(a)) {
    const shorter = a.length < b.length ? a : b
    const longer = a.length < b.length ? b : a
    return shorter.length / longer.length
  }
  return 0
}

/** ベストマッチを探す */
function bestMatch(
  amazonTitle: string,
  tmdbSeasons: TmdbSeason[],
): { season: TmdbSeason; score: number } | null {
  let best: { season: TmdbSeason; score: number } | null = null

  for (const season of tmdbSeasons) {
    const score = titleSimilarity(amazonTitle, season.displayName)
    if (score > 0 && (!best || score > best.score)) {
      best = { season, score }
    }
  }

  // タイトル類似度でマッチしなかった場合、シーズン番号マッチを試みる
  if (!best) {
    const amazonSeasonNum = extractSeasonNumber(amazonTitle)
    if (amazonSeasonNum !== null) {
      // TMDBシーズン名からシーズン番号を抽出してマッチ
      for (const season of tmdbSeasons) {
        const tmdbSeasonNum = extractTmdbSeasonNumber(season.displayName)
        if (tmdbSeasonNum === amazonSeasonNum) {
          best = { season, score: 0.5 }
          break
        }
        // TMDBの seasonNumber とも比較
        if (season.seasonNumber === amazonSeasonNum) {
          best = { season, score: 0.4 }
          break
        }
      }
    }
    // シーズン番号がないタイトル → シーズン1扱い
    if (!best && extractSeasonNumber(amazonTitle) === null) {
      // TMDBのS1にマッチ（「シーズン1」のようなgenericな名前の場合のみ）
      const s1 = tmdbSeasons.find((s) => s.seasonNumber === 1)
      if (s1) {
        const tmdbSN = extractTmdbSeasonNumber(s1.displayName)
        // TMDBのS1名が「シーズン1」のようなgenericなら、Amazonベースタイトルと一致するとみなす
        if (tmdbSN === 1) {
          best = { season: s1, score: 0.3 }
        }
      }
    }
  }

  return best
}

async function main() {
  const providers = ['amazon', 'hulu'] as const

  let totalSkipGroups = 0
  let fullyMatched = 0
  let partiallyMatched = 0
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

    // tmdbIdでグループ化
    const tmdbGroups = new Map<number, Title[]>()
    for (const title of titles) {
      if (typeof title.tmdbId !== 'number') continue
      const group = tmdbGroups.get(title.tmdbId)
      if (group) group.push(title)
      else tmdbGroups.set(title.tmdbId, [title])
    }

    for (const [tmdbId, group] of tmdbGroups) {
      if (group.length <= 1) continue

      // seasonNumberが重複しているケースのみ（SKIPケース）
      const allSeasonNumbers = group.flatMap((t) => t.seasons.map((s) => s.seasonNumber))
      if (new Set(allSeasonNumbers).size === allSeasonNumbers.length) continue

      // TMDBメタデータ読み込み
      const metaFile = Bun.file(`${TMDB_CACHE_DIR}/${tmdbId}.json`)
      if (!(await metaFile.exists())) continue
      const meta: TmdbMeta = await metaFile.json()

      totalSkipGroups++

      console.log(`\n${'─'.repeat(60)}`)
      console.log(`[${provider}] tmdbId=${tmdbId} "${meta.title}" — ${group.length} Amazon titles, ${meta.episodes.seasons.length} TMDB seasons`)
      console.log(`  TMDB seasons:`)
      for (const s of meta.episodes.seasons) {
        console.log(`    S${s.seasonNumber}: ${s.displayName} (${s.episodes.length} eps)`)
      }

      console.log(`  Amazon titles:`)
      const assignments: { title: Title; match: { season: TmdbSeason; score: number } | null }[] = []
      for (const title of group) {
        const match = bestMatch(title.title, meta.episodes.seasons)
        assignments.push({ title, match })
        const epCount = title.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
        if (match) {
          console.log(`    "${title.title}" (${epCount} eps) → S${match.season.seasonNumber} "${match.season.displayName}" (score: ${match.score.toFixed(2)})`)
        } else {
          console.log(`    "${title.title}" (${epCount} eps) → ✗ NO MATCH`)
        }
      }

      const matched = assignments.filter((a) => a.match !== null)
      // 同じTMDBシーズンに複数割り当てされていないかチェック
      const assignedSeasons = matched.map((a) => a.match!.season.seasonNumber)
      const hasDupAssignment = new Set(assignedSeasons).size !== assignedSeasons.length

      if (hasDupAssignment) {
        console.log(`  ⚠ CONFLICT: 複数のAmazonタイトルが同じTMDBシーズンにマッチ`)
        partiallyMatched++
      } else if (matched.length === group.length) {
        console.log(`  ✓ FULL MATCH: 全タイトルがユニークなTMDBシーズンに対応`)
        fullyMatched++
      } else if (matched.length > 0) {
        console.log(`  △ PARTIAL: ${matched.length}/${group.length} マッチ`)
        partiallyMatched++
      } else {
        console.log(`  ✗ NO MATCH`)
        noMatch++
      }
    }
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Summary: ${totalSkipGroups} SKIP groups`)
  console.log(`  Full match:    ${fullyMatched}`)
  console.log(`  Partial match: ${partiallyMatched}`)
  console.log(`  No match:      ${noMatch}`)
}

main()
