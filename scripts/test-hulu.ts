import { HuluProvider } from '../src/lib/providers/hulu'

const provider = new HuluProvider()

// newEpisodesOnly で最近追加されたタイトルのみ取得
console.log('=== Hulu 最近追加されたアニメ ===')
const recentTitles = await provider.fetchTitleList({ newEpisodesOnly: true })
console.log(`取得件数: ${recentTitles.length}`)
console.log('\n--- 一覧 ---')
for (const t of recentTitles) {
  console.log(`  [${t.entityType}] ${t.title} (${t.contentId})`)
}

// 最近追加されたタイトルからエピソード詳細を取得
const target = recentTitles[0]
if (target) {
  console.log(`\n=== エピソード詳細: ${target.title} (${target.contentId}) ===`)
  const detail = await provider.fetchEpisodeList(target.contentId)
  console.log(`タイトル: ${detail.title}`)
  console.log(`説明: ${detail.description.slice(0, 100)}...`)
  console.log(`シーズン数: ${detail.seasons.length}`)
  for (const season of detail.seasons) {
    console.log(`\n  シーズン: ${season.displayName} (${season.episodes.length}話)`)
    for (const ep of season.episodes.slice(0, 5)) {
      console.log(`    第${ep.episodeNumber}話: ${ep.title} (${ep.releaseDate})`)
    }
    if (season.episodes.length > 5) {
      console.log(`    ... 他${season.episodes.length - 5}話`)
    }
  }
}
