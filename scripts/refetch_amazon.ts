import { AmazonProvider } from '../src/lib/providers/amazon'

const CONCURRENCY = 5
const OUTPUT_DIR = '__tests__/fixtures/amazon/episodes_refetched'

const result = Bun.spawnSync({
  cmd: [
    'bunx', 'wrangler', 'd1', 'execute', 'anime-tracker-staging', '--local',
    '--command', "SELECT content_id, image_url FROM anime WHERE provider = 'amazon'",
    '--json'
  ],
  stdout: 'pipe',
  stderr: 'pipe'
})

const rows = JSON.parse(result.stdout.toString())[0].results as { content_id: string; image_url: string }[]
console.log(`Found ${rows.length} Amazon titles`)

const { mkdirSync, existsSync } = await import('node:fs')
mkdirSync(OUTPUT_DIR, { recursive: true })

const amazon = new AmazonProvider()
let success = 0
let failed = 0
let skipped = 0

for (let i = 0; i < rows.length; i += CONCURRENCY) {
  const batch = rows.slice(i, i + CONCURRENCY)
  const results = await Promise.allSettled(
    batch.map(async (row) => {
      const outPath = `${OUTPUT_DIR}/${row.content_id}.json`
      if (existsSync(outPath)) return null
      const titleInfo = await amazon.fetchTitleInfo(row.content_id)
      return {
        contentId: row.content_id,
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
      console.error(`FAILED [${batch[idx].content_id}]: ${r.reason}`)
    }
  }

  const total = success + failed + skipped
  if (total % 200 === 0 || i + CONCURRENCY >= rows.length) {
    console.log(`[${total}/${rows.length}] ${success} ok, ${failed} failed, ${skipped} skipped`)
  }
}

console.log(`\nDone: ${success} succeeded, ${failed} failed, ${skipped} skipped → ${OUTPUT_DIR}/`)
