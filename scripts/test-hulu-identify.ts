import { searchAniList } from '../src/lib/anilist'
import { HuluProvider } from '../src/lib/providers/hulu'
import { searchTmdbTv } from '../src/lib/tmdb'

const TMDB_API_KEY = process.env.TMDB_API_KEY
if (!TMDB_API_KEY) {
  console.error('TMDB_API_KEY が設定されていません')
  process.exit(1)
}

const provider = new HuluProvider()

console.log('=== Hulu 新着タイトルの識別テスト ===')
const titles = await provider.fetchTitleList({ newEpisodesOnly: true })
console.log(`取得件数: ${titles.length}\n`)

// 先頭5件で識別テスト
for (const title of titles.slice(0, 5)) {
  console.log(`--- ${title.title} (${title.contentId}) ---`)

  const [tmdb, anilist] = await Promise.all([
    searchTmdbTv(title.title, TMDB_API_KEY).catch(() => null),
    searchAniList(title.title).catch(() => null)
  ])

  console.log(`  TMDB:    ${tmdb ? `id=${tmdb.id} name=${tmdb.name}` : 'not found'}`)
  console.log(
    `  AniList: ${anilist ? `id=${anilist.id} title=${anilist.nativeTitle} status=${anilist.status}` : 'not found'}`
  )
  console.log(`  → ${tmdb || anilist ? '追加対象' : 'スキップ'}`)
  console.log()
}
