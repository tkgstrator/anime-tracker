import { AmazonProvider } from '../src/lib/providers/amazon'

const amazon = new AmazonProvider()
const titleId = process.argv[2] || 'B0FPDW14C3'
const detail = await amazon.fetchEpisodeList(titleId)

console.log(`Title: ${detail.title}`)
console.log(`Seasons: ${detail.seasons.length}`)

for (const s of detail.seasons) {
  const seasonDetail = {
    ...detail,
    seasons: [s]
  }
  const outputPath = `__tests__/fixtures/amazon/titles/${s.seasonId}.json`
  await Bun.write(outputPath, JSON.stringify(seasonDetail, null, 2) + '\n')
  console.log(`  ${s.displayName} (${s.seasonId}): ${s.episodes.length} episodes → ${outputPath}`)
}

const total = detail.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
console.log(`Total episodes: ${total}`)
