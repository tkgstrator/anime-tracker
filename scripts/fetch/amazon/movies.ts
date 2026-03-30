import { AmazonProvider } from '../../../src/lib/providers/amazon'

const CONCURRENCY = 5
const CACHE_DIR = '.cache/amazon-browse'
const EPISODES_DIR = `${CACHE_DIR}/movies`

type IdentifiedMovie = {
  contentId: string
  title: string
  entityType: string
  imageUrl: string
  aniListId: number
  aniListTitle: string
  status: string
  year: number
  quarter: number
}

const allMovies: IdentifiedMovie[] = await Bun.file(`${CACHE_DIR}/titles_identified_movies.json`).json()
const allIds = allMovies.map((m) => m.contentId)
const imageMap = new Map(allMovies.map((m) => [m.contentId, m.imageUrl]))

// 既存ファイルをフィルタリング
await Bun.file(`${EPISODES_DIR}/.gitkeep`).writer().end()
const movieIds: string[] = []
for (const id of allIds) {
  if (await Bun.file(`${EPISODES_DIR}/${id}.json`).exists()) continue
  movieIds.push(id)
}

console.log(
  `Fetching details for ${movieIds.length} movies (${allIds.length - movieIds.length} cached, concurrency: ${CONCURRENCY})...`
)

const amazon = new AmazonProvider()
let success = 0
let failed = 0

for (let i = 0; i < movieIds.length; i += CONCURRENCY) {
  const batch = movieIds.slice(i, i + CONCURRENCY)
  await Promise.all(
    batch.map(async (contentId) => {
      try {
        const detail = await amazon.fetchTitleInfo(contentId)
        await Bun.write(`${EPISODES_DIR}/${contentId}.json`, JSON.stringify(detail, null, 2) + '\n')
        success++
        console.log(`${contentId}: ${detail.title} (${detail.entityType})`)
      } catch (e) {
        failed++
        console.error(`${contentId}: FAILED - ${e instanceof Error ? e.message : e}`)
      }
    })
  )
}

console.log(`\nFetch done: ${success} succeeded, ${allIds.length - movieIds.length} cached, ${failed} failed`)

// Build content_identified_movies.json from all individual files + identified metadata
const results = []
for (const movie of allMovies) {
  const file = Bun.file(`${EPISODES_DIR}/${movie.contentId}.json`)
  if (!(await file.exists())) continue
  const detail = await file.json()
  results.push({
    ...movie,
    detail
  })
}
results.sort((a, b) => a.title.localeCompare(b.title, 'ja'))

const outputPath = `${CACHE_DIR}/content_identified_movies.json`
await Bun.write(outputPath, JSON.stringify(results, null, 2) + '\n')
console.log(`\nWrote ${results.length} entries → ${outputPath}`)
