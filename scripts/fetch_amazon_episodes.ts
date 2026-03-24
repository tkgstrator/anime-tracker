import { AmazonProvider } from '../src/lib/providers/amazon'

const CONCURRENCY = 10
const EPISODES_DIR = '__tests__/fixtures/amazon/episodes'

const allJson: { contentId?: string; titleID?: string; imageUrl?: string }[] = await Bun.file('__tests__/fixtures/amazon/all.json').json()
const allIds = [...new Set(allJson.map((d) => (d.contentId ?? d.titleID)!))]
const browseImageMap = new Map(allJson.map((d) => [(d.contentId ?? d.titleID)!, d.imageUrl]))

// 既存ファイルをフィルタリング
const titleIds: string[] = []
for (const id of allIds) {
  if (await Bun.file(`${EPISODES_DIR}/${id}.json`).exists()) continue
  titleIds.push(id)
}

console.log(`Fetching episodes for ${titleIds.length} titles (${allIds.length - titleIds.length} cached, concurrency: ${CONCURRENCY})...`)

const amazon = new AmazonProvider()
let success = 0
let failed = 0

for (let i = 0; i < titleIds.length; i += CONCURRENCY) {
  const batch = titleIds.slice(i, i + CONCURRENCY)
  await Promise.all(
    batch.map(async (titleId) => {
      try {
        const detail = await amazon.fetchTitleInfo(titleId)
        await Bun.write(`${EPISODES_DIR}/${titleId}.json`, JSON.stringify(detail, null, 2) + '\n')
        success++
        const episodeCount = detail.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
        console.log(`${titleId}: ${detail.title} (${detail.seasons.length} seasons, ${episodeCount} episodes)`)
      } catch (e) {
        failed++
        console.error(`${titleId}: FAILED - ${e instanceof Error ? e.message : e}`)
      }
    }),
  )
}

console.log(`\nDone: ${success} succeeded, ${allIds.length - titleIds.length} cached, ${failed} failed → ${EPISODES_DIR}/`)

// Build episodes.json from all individual episode files
const glob = new Bun.Glob('*.json')
const episodes = []
for await (const file of glob.scan(EPISODES_DIR)) {
  const data = await Bun.file(`${EPISODES_DIR}/${file}`).json()
  const contentId = file.replace('.json', '')
  data.contentId = contentId
  const browseImage = browseImageMap.get(contentId)
  if (browseImage) data.imageUrl = browseImage
  episodes.push(data)
}
episodes.sort((a, b) => a.title.localeCompare(b.title, 'ja'))

const outputPath = '__tests__/fixtures/amazon/episodes.json'
await Bun.write(outputPath, JSON.stringify(episodes, null, 2) + '\n')
console.log(`\nWrote ${episodes.length} entries → ${outputPath}`)
