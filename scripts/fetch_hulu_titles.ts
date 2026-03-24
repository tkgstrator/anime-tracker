import { HuluProvider } from '../src/lib/providers/hulu'
import { AniListAdapter } from '../src/lib/metadata/anilist'

const CONCURRENCY = 3
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
const slugs = rows.map((r) => r.content_id)

console.log(`Found ${slugs.length} Hulu slugs in DB`)

await Bun.write(`${OUTPUT_DIR}/.gitkeep`, '')

const hulu = new HuluProvider(new AniListAdapter())
let success = 0
let skipped = 0
let failed = 0

for (let i = 0; i < slugs.length; i += CONCURRENCY) {
  const batch = slugs.slice(i, i + CONCURRENCY)
  await Promise.all(
    batch.map(async (slug) => {
      const filePath = `${OUTPUT_DIR}/${slug}.json`
      const file = Bun.file(filePath)

      if (await file.exists()) {
        skipped++
        return
      }

      try {
        const detail = await hulu.fetchTitle(slug)
        await Bun.write(filePath, JSON.stringify(detail, null, 2) + '\n')
        success++
        console.log(`[${success + skipped + failed}/${slugs.length}] ${slug}: ${detail.title}`)
      } catch (e) {
        failed++
        console.error(`[${success + skipped + failed}/${slugs.length}] ${slug}: FAILED - ${e instanceof Error ? e.message : e}`)
      }
    })
  )
}

console.log(`\nDone: ${success} succeeded, ${skipped} skipped, ${failed} failed → ${OUTPUT_DIR}/`)
