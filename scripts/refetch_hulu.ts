import { HuluProvider } from '../src/lib/providers/hulu'

const CONCURRENCY = 50
const OUTPUT_DIR = '__tests__/fixtures/hulu/episodes_refetched'

const result = Bun.spawnSync({
  cmd: [
    'bunx', 'wrangler', 'd1', 'execute', 'anime-tracker-staging', '--local',
    '--command', "SELECT content_id FROM anime WHERE provider = 'hulu'",
    '--json'
  ],
  stdout: 'pipe',
  stderr: 'pipe'
})

const rows = JSON.parse(result.stdout.toString())[0].results as { content_id: string }[]
const slugs = rows.map((r) => r.content_id)
console.log(`Found ${slugs.length} Hulu slugs`)

const { mkdirSync, existsSync } = await import('node:fs')
mkdirSync(OUTPUT_DIR, { recursive: true })

const hulu = new HuluProvider()
let success = 0
let failed = 0
let skipped = 0

for (let i = 0; i < slugs.length; i += CONCURRENCY) {
  const batch = slugs.slice(i, i + CONCURRENCY)
  const results = await Promise.allSettled(
    batch.map(async (slug) => {
      if (existsSync(`${OUTPUT_DIR}/${slug}.json`)) return null
      const titleInfo = await hulu.fetchTitleInfo(slug)
      return {
        contentId: slug,
        title: titleInfo.title,
        description: titleInfo.description,
        entityType: titleInfo.entityType,
        maturityRating: titleInfo.maturityRating,
        imageUrl: titleInfo.imageUrl,
        benefitId: titleInfo.benefitId,
        seasons: titleInfo.seasons
      }
    })
  )

  for (const [idx, r] of results.entries()) {
    if (r.status === 'fulfilled') {
      const data = r.value
      if (data === null) {
        skipped++
      } else {
        await Bun.write(`${OUTPUT_DIR}/${data.contentId}.json`, JSON.stringify(data, null, 2) + '\n')
        success++
      }
    } else {
      failed++
      console.error(`FAILED [${batch[idx]}]: ${r.reason}`)
    }
  }

  const total = success + failed + skipped
  if (total % 200 === 0 || i + CONCURRENCY >= slugs.length) {
    console.log(`[${total}/${slugs.length}] ${success} ok, ${failed} failed, ${skipped} skipped`)
  }
}

console.log(`\nDone: ${success} succeeded, ${failed} failed, ${skipped} skipped → ${OUTPUT_DIR}/`)
