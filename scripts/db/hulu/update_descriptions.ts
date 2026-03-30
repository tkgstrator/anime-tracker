import { readdir } from 'fs/promises'

const DIR = '__tests__/fixtures/hulu/titles'
const files = (await readdir(DIR)).filter((f) => f.endsWith('.json'))

const updates: { slug: string; description: string }[] = []
for (const f of files) {
  const data = await Bun.file(`${DIR}/${f}`).json()
  const slug = f.replace('.json', '')
  const description: string = data.description ?? ''
  if (description.length > 0) {
    updates.push({ slug, description })
  }
}

console.log(`Updating ${updates.length} descriptions...`)

// Build SQL statements in batches
const BATCH_SIZE = 50
for (let i = 0; i < updates.length; i += BATCH_SIZE) {
  const batch = updates.slice(i, i + BATCH_SIZE)
  const sql = batch
    .map(({ slug, description }) => {
      const escaped = description.replaceAll("'", "''")
      return `UPDATE anime SET description = '${escaped}' WHERE provider = 'hulu' AND content_id = '${slug}';`
    })
    .join('\n')

  const result = Bun.spawnSync({
    cmd: ['bunx', 'wrangler', 'd1', 'execute', 'anime-tracker-staging', '--local', '--command', sql],
    stdout: 'pipe',
    stderr: 'pipe'
  })

  if (result.exitCode !== 0) {
    console.error(`Batch ${i}-${i + batch.length} failed:`, result.stderr.toString())
  } else {
    console.log(`[${Math.min(i + BATCH_SIZE, updates.length)}/${updates.length}] updated`)
  }
}

// Verify
const check = Bun.spawnSync({
  cmd: [
    'bunx', 'wrangler', 'd1', 'execute', 'anime-tracker-staging', '--local',
    '--command', "SELECT count(*) as cnt FROM anime WHERE provider = 'hulu' AND description != ''",
    '--json'
  ],
  stdout: 'pipe',
  stderr: 'pipe'
})
const count = JSON.parse(check.stdout.toString())[0].results[0].cnt
console.log(`\nDone. ${count} Hulu titles now have descriptions.`)
