import { fetchHuluAnimeByDecade } from '../src/lib/providers/hulu/browse'
import { fetchSeriesMeta } from '../src/lib/providers/hulu/detail'

const CONCURRENCY = 10
const OUTPUT_DIR = '__tests__/fixtures/hulu/titles'

// Get all Hulu slugs from local D1
const result = Bun.spawnSync({
  cmd: [
    'bunx',
    'wrangler',
    'd1',
    'execute',
    'anime-tracker-staging',
    '--local',
    '--command',
    "SELECT content_id FROM anime WHERE provider = 'hulu'",
    '--json'
  ],
  stdout: 'pipe',
  stderr: 'pipe'
})

const rows = JSON.parse(result.stdout.toString())[0].results as { content_id: string }[]
const dbSlugs = new Set(rows.map((r) => r.content_id))

console.log(`Found ${dbSlugs.size} Hulu slugs in DB`)

// Fetch all VodItems from browse API to build slug → id_in_schema map
console.log('Fetching browse API for slug → id_in_schema mapping...')
const allItems = (await Promise.all([2000, 2010, 2020].map((d) => fetchHuluAnimeByDecade(d)))).flat()
const slugToId = new Map<string, number>()
for (const item of allItems) {
  if (!slugToId.has(item.slug)) {
    slugToId.set(item.slug, item.additionalInfo.id_in_schema)
  }
}
console.log(`Browse API: ${slugToId.size} unique slugs`)

// Filter to DB slugs that have a mapping
const targets = [...dbSlugs].filter((slug) => slugToId.has(slug))
const noMapping = [...dbSlugs].filter((slug) => !slugToId.has(slug))
console.log(`Targets: ${targets.length}, No mapping: ${noMapping.length}`)

await Bun.write(`${OUTPUT_DIR}/.gitkeep`, '')

let success = 0
let skipped = 0
let failed = 0

for (let i = 0; i < targets.length; i += CONCURRENCY) {
  const batch = targets.slice(i, i + CONCURRENCY)
  await Promise.all(
    batch.map(async (slug) => {
      const filePath = `${OUTPUT_DIR}/${slug}.json`
      const file = Bun.file(filePath)

      if (await file.exists()) {
        skipped++
        return
      }

      try {
        const seriesId = slugToId.get(slug)!
        const meta = await fetchSeriesMeta(seriesId)
        await Bun.write(filePath, JSON.stringify({ slug, seriesId, ...meta }, null, 2) + '\n')
        success++
        const total = success + skipped + failed
        if (total % 50 === 0 || total === targets.length) {
          console.log(`[${total}/${targets.length}] progress...`)
        }
      } catch (e) {
        failed++
        console.error(`[${success + skipped + failed}/${targets.length}] ${slug}: FAILED - ${e instanceof Error ? e.message : e}`)
      }
    })
  )
}

console.log(`\nDone: ${success} succeeded, ${skipped} skipped, ${failed} failed → ${OUTPUT_DIR}/`)
