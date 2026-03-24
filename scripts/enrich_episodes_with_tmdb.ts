import { searchTmdbTv, fetchTmdbEpisodes } from '../src/lib/tmdb'
import { searchAniListBatch, type AniListResult } from '../src/lib/anilist'

const TMDB_API_KEY = process.env.TMDB_API_KEY!
if (!TMDB_API_KEY) {
  console.error('TMDB_API_KEY is required')
  process.exit(1)
}

const CHUNK_SIZE = 50
const CACHE_DIR = '.cache'
const TMDB_CACHE_DIR = `${CACHE_DIR}/tmdb`

type Mapping = Record<string, number | null>
type AniListMapping = Record<string, AniListResult | null>

async function loadAniListMapping(provider: string): Promise<AniListMapping> {
  const file = Bun.file(`${CACHE_DIR}/${provider}/anilist_mapping.json`)
  if (await file.exists()) return file.json()
  return {}
}

async function saveAniListMapping(provider: string, mapping: AniListMapping): Promise<void> {
  await Bun.write(`${CACHE_DIR}/${provider}/anilist_mapping.json`, JSON.stringify(mapping, null, 2) + '\n')
}

interface TmdbMeta {
  title: string
  description: string
  episodes: Awaited<ReturnType<typeof fetchTmdbEpisodes>>
}

async function loadMapping(provider: string): Promise<Mapping> {
  const file = Bun.file(`${CACHE_DIR}/${provider}/mapping.json`)
  if (await file.exists()) return file.json()
  return {}
}

async function saveMapping(provider: string, mapping: Mapping): Promise<void> {
  await Bun.write(`${CACHE_DIR}/${provider}/mapping.json`, JSON.stringify(mapping, null, 2) + '\n')
}

async function loadTmdbMeta(tmdbId: number): Promise<TmdbMeta | null> {
  const file = Bun.file(`${TMDB_CACHE_DIR}/${tmdbId}.json`)
  if (await file.exists()) return file.json()
  return null
}

async function saveTmdbMeta(tmdbId: number, meta: TmdbMeta): Promise<void> {
  await Bun.write(`${TMDB_CACHE_DIR}/${tmdbId}.json`, JSON.stringify(meta, null, 2) + '\n')
}

interface Episode {
  episodeNumber: number
  episodeId: string
  title: string
  description: string
  [key: string]: unknown
}

interface Season {
  seasonNumber: number
  episodes: Episode[]
  [key: string]: unknown
}

interface Title {
  contentId: string
  title: string
  description: string
  seasons: Season[]
  tmdbId?: number | null
  [key: string]: unknown
}

function cleanTitle(title: string): string {
  return title
    // 全角英数記号→半角
    .replace(/[\uff01-\uff5e]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    // 全角スペース→半角
    .replace(/\u3000/g, ' ')
    // シーズン/期/クール/シリーズ表記を除去
    .replace(/\s*シーズン\d+.*/, '')
    .replace(/\s*Season\s*\d+.*/i, '')
    .replace(/\s*第?[\d一二三四五六七八九十壱弐参]+期.*/, '')
    .replace(/\s*第?\d+クール.*/, '')
    .replace(/\s*第?\d+シリーズ.*/, '')
    .replace(/\s*Part\s*\d+.*/i, '')
    // サブタイトル区切り（／や～）以降を除去
    .replace(/\s*／.*/, '')
    // 括弧系の除去
    .replace(/\([^)]*\)/g, '')
    .replace(/（[^）]*）/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[「」『』〈〉]/g, ' ')
    .replace(/\s*#\d+\s.*/, '')
    // 全角半角句読点正規化
    .replace(/｡/g, '。')
    .replace(/､/g, '、')
    .replace(/\s+/g, ' ')
    .trim()
}

function progress(msg: string) {
  process.stdout.write(`\r\x1b[K${msg}`)
}

// interface MergeStats {
//   titles: number
//   deduped: number
//   single: number
//   nullTmdbId: number
//   skippedDupSeason: number
//   mergeDetails: string[]
// }
//
// function seasonsFingerprint(title: Title): string {
//   return title.seasons
//     .map((s) => s.seasonId)
//     .sort()
//     .join('|')
// }
//
// function mergeTitlesByTmdbId(titles: Title[]): { titles: Title[]; stats: MergeStats } {
//   const tmdbGroups = new Map<number, Title[]>()
//   const result: Title[] = []
//   const stats: MergeStats = {
//     titles: 0,
//     deduped: 0,
//     single: 0,
//     nullTmdbId: 0,
//     skippedDupSeason: 0,
//     mergeDetails: [],
//   }
//
//   for (const title of titles) {
//     if (typeof title.tmdbId === 'number') {
//       const group = tmdbGroups.get(title.tmdbId)
//       if (group) {
//         group.push(title)
//       } else {
//         tmdbGroups.set(title.tmdbId, [title])
//       }
//     } else {
//       stats.nullTmdbId++
//       result.push(title)
//     }
//   }
//
//   for (const [, rawGroup] of tmdbGroups) {
//     if (rawGroup.length === 1) {
//       stats.single++
//       result.push(rawGroup[0])
//       continue
//     }
//
//     const byFingerprint = new Map<string, Title[]>()
//     for (const title of rawGroup) {
//       const fp = seasonsFingerprint(title)
//       const existing = byFingerprint.get(fp)
//       if (existing) {
//         existing.push(title)
//       } else {
//         byFingerprint.set(fp, [title])
//       }
//     }
//
//     const group: Title[] = []
//     for (const [, dupes] of byFingerprint) {
//       if (dupes.length > 1) {
//         stats.deduped += dupes.length - 1
//       }
//       group.push(dupes[0])
//     }
//
//     if (group.length === 1) {
//       stats.single++
//       result.push(group[0])
//       continue
//     }
//
//     const allSeasonNumbers = group.flatMap((t) => t.seasons.map((s) => s.seasonNumber))
//     const hasDuplicateSeasons = new Set(allSeasonNumbers).size !== allSeasonNumbers.length
//
//     if (hasDuplicateSeasons) {
//       stats.skippedDupSeason++
//       for (const title of group) {
//         result.push(title)
//       }
//       continue
//     }
//
//     stats.titles++
//     group.sort((a, b) => a.title.localeCompare(b.title, 'ja'))
//     const titles = group[0]
//     const titlesSeasons: Season[] = []
//     for (const title of group) {
//       titlesSeasons.push(...title.seasons)
//     }
//     titlesSeasons.sort((a, b) => a.seasonNumber - b.seasonNumber)
//     titles.seasons = titlesSeasons
//     titles.contentId = group.map((t) => t.contentId).sort()[0]
//     result.push(titles)
//   }
//
//   return { titles: result, stats }
// }

async function processFile(provider: string, inputPath: string, outputPath: string) {
  const titles: Title[] = await Bun.file(inputPath).json()
  const mapping = await loadMapping(provider)
  console.log(`\n${'='.repeat(60)}`)
  console.log(`Processing: ${inputPath} (${titles.length} titles)`)
  console.log(`Cache: ${Object.keys(mapping).length} mappings`)
  console.log('='.repeat(60))

  // Step 1: Identify tmdbIds (movieはスキップ)
  const shouldSkip = (t: Title) =>
    t.entityType === 'movie' ||
    /舞台|THE STAGE|STAGE|ステージ|MUSICAL|ミュージカル|朗読劇|LIVE|ライブ|コンサート|フェス|公演|イベント/i.test(t.title as string)
  const toProcess = titles.filter((t) => typeof t.tmdbId !== 'number' && !shouldSkip(t))
  const alreadyMatched = titles.length - toProcess.length
  console.log(`\n[Step 1] TMDB Identify: ${toProcess.length} to lookup, ${alreadyMatched} already matched`)

  let identified = 0
  let notFound = 0
  let cacheHit = 0

  for (let i = 0; i < toProcess.length; i += CHUNK_SIZE) {
    const chunk = toProcess.slice(i, i + CHUNK_SIZE)
    const results = await Promise.all(
      chunk.map(async (title) => {
        if (mapping[title.contentId] != null) {
          cacheHit++
          return { title, tmdbId: mapping[title.contentId] }
        }
        const query = cleanTitle(title.title)
        try {
          const result = await searchTmdbTv(query, TMDB_API_KEY)
          const tmdbId = result?.id ?? null
          mapping[title.contentId] = tmdbId
          return { title, tmdbId }
        } catch {
          return { title, tmdbId: null }
        }
      }),
    )

    for (const { title, tmdbId } of results) {
      title.tmdbId = tmdbId
      if (tmdbId) {
        identified++
      } else {
        notFound++
      }
    }

    const done = Math.min(i + CHUNK_SIZE, toProcess.length)
    progress(`[identify] ${done}/${toProcess.length} — found: ${identified}, not found: ${notFound}, cached: ${cacheHit}`)
  }
  if (toProcess.length > 0) console.log('')
  console.log(`  Result: ${identified} found, ${notFound} not found, ${cacheHit} cached`)
  await saveMapping(provider, mapping)

  // not_found.json: tmdbIdがnullのcontentId + title一覧
  const notFoundList = titles
    .filter((t) => t.tmdbId === null && !shouldSkip(t))
    .map((t) => ({ contentId: t.contentId, title: t.title, cleanedTitle: cleanTitle(t.title), ...(provider === 'amazon' && { entityType: t.entityType }) }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ja'))
  await Bun.write(`${CACHE_DIR}/${provider}/not_found.json`, JSON.stringify(notFoundList, null, 2) + '\n')
  console.log(`  Not found: ${notFoundList.length} entries → ${CACHE_DIR}/${provider}/not_found.json`)

  // Step 1.5: AniList Identify
  const anilistMapping = await loadAniListMapping(provider)
  const anilistToProcess = titles.filter((t) => !(t.contentId in anilistMapping) && !shouldSkip(t))
  const anilistCached = titles.filter((t) => t.contentId in anilistMapping && !shouldSkip(t))
  console.log(`\n[Step 1.5] AniList Identify: ${anilistToProcess.length} to lookup, ${anilistCached.length} cached`)

  let anilistFound = 0
  let anilistNotFound = 0

  for (let i = 0; i < anilistToProcess.length; i += CHUNK_SIZE) {
    const chunk = anilistToProcess.slice(i, i + CHUNK_SIZE)
    const results = await searchAniListBatch(chunk.map((t) => t.title))

    for (let j = 0; j < chunk.length; j++) {
      anilistMapping[chunk[j].contentId] = results[j]
      if (results[j]) anilistFound++
      else anilistNotFound++
    }

    const done = Math.min(i + CHUNK_SIZE, anilistToProcess.length)
    progress(`[anilist] ${done}/${anilistToProcess.length} — found: ${anilistFound}, not found: ${anilistNotFound}`)
  }
  if (anilistToProcess.length > 0) console.log('')
  console.log(`  Result: ${anilistFound} found, ${anilistNotFound} not found, ${anilistCached.length} cached`)
  await saveAniListMapping(provider, anilistMapping)

  // AniListメタデータをタイトルに適用
  for (const title of titles) {
    const result = anilistMapping[title.contentId]
    if (result) {
      title.anilistId = result.id
      if (result.nativeTitle) title.title = result.nativeTitle
      title.status = result.status ?? 'UNKNOWN'
      title.year = result.year
      title.quarter = result.quarter
    }
  }

  // Summary: TMDB / AniList の合致数
  const tmdbMatched = titles.filter((t) => typeof t.tmdbId === 'number').length
  const anilistMatched = titles.filter((t) => t.anilistId).length
  const bothMatched = titles.filter((t) => typeof t.tmdbId === 'number' && t.anilistId).length
  const eitherMatched = titles.filter((t) => typeof t.tmdbId === 'number' || t.anilistId).length
  console.log(`\n  Identification summary:`)
  console.log(`    TMDB:     ${tmdbMatched}`)
  console.log(`    AniList:  ${anilistMatched}`)
  console.log(`    Both:     ${bothMatched}`)
  console.log(`    Either:   ${eitherMatched}`)

  // Step 2: Merge (disabled — マージ廃止)
  // console.log('\n[Step 2] Merge titles with same tmdbId')
  // const { titles: titles, stats } = mergeTitlesByTmdbId(titles)

  // Step 2: Enrich
  const matched = titles.filter((t: Title) => t.tmdbId)
  console.log(`\n[Step 2] Enrich episode details: ${matched.length} titles`)

  let enriched = 0
  let fetchFailed = 0

  for (let i = 0; i < matched.length; i += CHUNK_SIZE) {
    const chunk = matched.slice(i, i + CHUNK_SIZE)
    await Promise.all(
      chunk.map(async (title) => {
        try {
          const tmdbId = title.tmdbId!
          let meta = await loadTmdbMeta(tmdbId)

          if (!meta) {
            const tmdbData = await fetchTmdbEpisodes(tmdbId, TMDB_API_KEY)
            const tvRes = await fetch(
              `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${TMDB_API_KEY}&language=ja-JP`,
            )
            let tvTitle = ''
            let tvDescription = ''
            if (tvRes.ok) {
              const tv = (await tvRes.json()) as { name: string; overview: string }
              tvTitle = tv.name || ''
              tvDescription = tv.overview || ''
            }
            meta = { title: tvTitle, description: tvDescription, episodes: tmdbData }
            await saveTmdbMeta(tmdbId, meta)
          }

          if (meta.title) title.title = meta.title
          if (meta.description) title.description = meta.description

          // シーズンごとにyear/quarterを書き込み
          const tmdbSeasonMap = new Map(
            meta.episodes.seasons.map((s) => [s.seasonNumber, s]),
          )
          for (const season of title.seasons) {
            const tmdbSeason = tmdbSeasonMap.get(season.seasonNumber)
            if (tmdbSeason) {
              ;(season as Record<string, unknown>).year = tmdbSeason.year
              ;(season as Record<string, unknown>).quarter = tmdbSeason.quarter
            }
          }

          const tmdbFlat = meta.episodes.seasons
            .sort((a, b) => a.seasonNumber - b.seasonNumber)
            .flatMap((s) => s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber))

          const localFlat: { ep: Episode; season: Season }[] = []
          for (const season of title.seasons.sort((a, b) => a.seasonNumber - b.seasonNumber)) {
            for (const ep of season.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber)) {
              localFlat.push({ ep, season })
            }
          }

          const count = Math.min(tmdbFlat.length, localFlat.length)
          for (let j = 0; j < count; j++) {
            const tmdbEp = tmdbFlat[j]
            const { ep: localEp } = localFlat[j]
            localEp.title = tmdbEp.title || localEp.title
            localEp.description = tmdbEp.description || localEp.description
          }
          enriched++
        } catch {
          fetchFailed++
        }
      }),
    )

    const done = Math.min(i + CHUNK_SIZE, matched.length)
    progress(`[enrich] ${done}/${matched.length} — enriched: ${enriched}, failed: ${fetchFailed}`)
  }
  if (matched.length > 0) console.log('')

  // contentIdの重複チェック: シーズン数が多い方を残す
  const byContentId = new Map<string, Title>()
  let dedupCount = 0
  for (const title of titles.filter((t) => typeof t.tmdbId === 'number' || t.anilistId)) {
    const existing = byContentId.get(title.contentId)
    if (existing) {
      dedupCount++
      if (title.seasons.length > existing.seasons.length) {
        byContentId.set(title.contentId, title)
      }
    } else {
      byContentId.set(title.contentId, title)
    }
  }
  const output = [...byContentId.values()]
  if (dedupCount > 0) {
    console.log(`  Deduped by contentId: ${dedupCount} duplicates removed`)
  }
  await Bun.write(outputPath, JSON.stringify(output, null, 2) + '\n')

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Output: ${outputPath}`)
  console.log(`  Total titles: ${output.length} (excluded ${titles.length - output.length} without tmdbId/anilistId)`)
  console.log(`  TMDB matched: ${alreadyMatched + identified}`)
  console.log(`  AniList matched: ${anilistFound + anilistCached.length}`)
  console.log(`  Enriched:     ${enriched}`)
  console.log(`  Enrich fail:  ${fetchFailed}`)
}

import { mkdirSync } from 'node:fs'
for (const dir of ['amazon', 'hulu', 'tmdb']) {
  mkdirSync(`${CACHE_DIR}/${dir}`, { recursive: true })
}

const providers = ['amazon', 'hulu'] as const
for (const provider of providers) {
  await processFile(
    provider,
    `__tests__/fixtures/${provider}/episodes.json`,
    `__tests__/fixtures/${provider}/episodes_identified.json`,
  )
}
