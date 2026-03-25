import { readdir } from 'fs/promises'

const RAW_DIR = '__tests__/fixtures/hulu/titles-raw'
const files = (await readdir(RAW_DIR)).filter((f) => f.endsWith('.json'))

// For each raw file, build a map of episode_number -> {episodeId, imageUrl}
// Then update DB episodes that have empty episode_id, matching by content_id + episode_number
const updates: string[] = []

for (const f of files) {
  const slug = f.replace('.json', '')
  const raw: { id_in_schema: number; imageUrl: string }[] = await Bun.file(`${RAW_DIR}/${f}`).json()

  for (let i = 0; i < raw.length; i++) {
    const ep = raw[i]
    const episodeId = String(ep.id_in_schema)
    const imageUrl = ep.imageUrl.split('?')[0]
    const escapedUrl = imageUrl.replaceAll("'", "''")
    const epNum = i + 1

    updates.push(
      `UPDATE episodes SET episode_id = '${episodeId}', image_url = '${escapedUrl}' WHERE episode_id = '' AND episode_number = ${epNum} AND season_id IN (SELECT s.id FROM seasons s JOIN anime a ON s.anime_id = a.id WHERE a.provider = 'hulu' AND a.content_id = '${slug}');`
    )
  }
}

console.log(`${updates.length} update statements`)

const BATCH_SIZE = 100
let applied = 0
for (let i = 0; i < updates.length; i += BATCH_SIZE) {
  const batch = updates.slice(i, i + BATCH_SIZE)
  const result = Bun.spawnSync({
    cmd: ['bunx', 'wrangler', 'd1', 'execute', 'anime-tracker-staging', '--local', '--command', batch.join('\n')],
    stdout: 'pipe',
    stderr: 'pipe'
  })
  if (result.exitCode !== 0) {
    console.error(`Batch ${i} failed:`, result.stderr.toString().slice(0, 300))
    break
  }
  applied += batch.length
  if (applied % 5000 === 0 || i + BATCH_SIZE >= updates.length) {
    console.log(`[${applied}/${updates.length}] applied`)
  }
}

const check = Bun.spawnSync({
  cmd: [
    'bunx', 'wrangler', 'd1', 'execute', 'anime-tracker-staging', '--local',
    '--command', "SELECT sum(case when e.episode_id = '' then 1 else 0 end) as empty_id FROM episodes e JOIN seasons s ON e.season_id = s.id JOIN anime a ON s.anime_id = a.id WHERE a.provider = 'hulu'",
    '--json'
  ],
  stdout: 'pipe',
  stderr: 'pipe'
})
console.log('\nRemaining empty episode_id:', JSON.parse(check.stdout.toString())[0].results[0])
