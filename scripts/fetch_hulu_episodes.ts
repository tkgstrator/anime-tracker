import { HuluProvider } from '../src/lib/providers/hulu'

const CONCURRENCY = 5
const EPISODES_DIR = '__tests__/fixtures/hulu/episodes'

const allJson = await Bun.file('__tests__/fixtures/hulu/all.json').json()
const titleMap = new Map<string, string>()
const browseImageMap = new Map<string, string>()
for (const d of allJson.data as { slug: string; title: string; imageUrl?: string }[]) {
  if (!titleMap.has(d.slug)) titleMap.set(d.slug, d.title)
  if (d.imageUrl && !browseImageMap.has(d.slug)) browseImageMap.set(d.slug, d.imageUrl)
}
const slugs = [...titleMap.keys()]

console.log(`Fetching episodes for ${slugs.length} titles (concurrency: ${CONCURRENCY})...`)

const hulu = new HuluProvider()
let success = 0
let skipped = 0
let failed = 0

for (let i = 0; i < slugs.length; i += CONCURRENCY) {
  const batch = slugs.slice(i, i + CONCURRENCY)
  await Promise.all(
    batch.map(async (slug) => {
      const filePath = `${EPISODES_DIR}/${slug}.json`
      const file = Bun.file(filePath)

      if (await file.exists()) {
        skipped++
        console.log(`${slug}: SKIPPED (cached)`)
        return
      }

      try {
        const detail = await hulu.fetchTitleInfo(slug)
        const title = titleMap.get(slug)
        if (title) detail.title = title
        await Bun.write(filePath, JSON.stringify(detail, null, 2) + '\n')
        success++
        const episodeCount = detail.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
        console.log(`${slug}: ${detail.title} (${detail.seasons.length} seasons, ${episodeCount} episodes)`)
      } catch (e) {
        failed++
        console.error(`${slug}: FAILED - ${e instanceof Error ? e.message : e}`)
      }
    }),
  )
}

console.log(`\nDone: ${success} succeeded, ${skipped} skipped, ${failed} failed → ${EPISODES_DIR}/`)

// Build episodes.json from all individual episode files, fixing titles from all.json
const glob = new Bun.Glob('*.json')
const episodes = []
for await (const file of glob.scan(EPISODES_DIR)) {
  const slug = file.replace(/\.json$/, '')
  const data = await Bun.file(`${EPISODES_DIR}/${file}`).json()
  const correctTitle = titleMap.get(slug)
  if (correctTitle && data.title !== correctTitle) {
    data.title = correctTitle
    await Bun.write(`${EPISODES_DIR}/${file}`, JSON.stringify(data, null, 2) + '\n')
  }
  const browseImage = browseImageMap.get(slug)
  if (browseImage) data.imageUrl = browseImage
  episodes.push({ contentId: slug, ...data })
}
episodes.sort((a, b) => a.title.localeCompare(b.title, 'ja'))

const outputPath = '__tests__/fixtures/hulu/episodes.json'
await Bun.write(outputPath, JSON.stringify(episodes, null, 2) + '\n')
console.log(`\nWrote ${episodes.length} entries → ${outputPath}`)
