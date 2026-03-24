/**
 * 改善したcleanTitleでNOT FOUNDタイトルが解決するか検証
 */

const ANILIST_URL = 'https://graphql.anilist.co'

interface AniListMedia {
  id: number
  title: { romaji: string; native: string | null }
  episodes: number | null
  format: string
}

async function searchAniList(query: string): Promise<AniListMedia | null> {
  const gql = `query ($search: String) {
    Media(search: $search, type: ANIME, format_in: [TV, TV_SHORT, ONA, OVA, SPECIAL]) {
      id
      title { romaji native }
      episodes
      format
    }
  }`
  const res = await fetch(ANILIST_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: gql, variables: { search: query } }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: { Media?: AniListMedia } }
  return data.data?.Media ?? null
}

/** enrich_episodes_with_tmdb.ts と同じ cleanTitle */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*シーズン\d+.*/, '')
    .replace(/\s*Season\s*\d+.*/i, '')
    .replace(/\s*第?\d+期.*/, '')
    .replace(/\s*Part\s*\d+.*/i, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[「」『』]/g, ' ')
    .replace(/\s*#\d+\s.*/, '')
    .replace(/｡/g, '。')
    .replace(/､/g, '、')
    .replace(/\s+/g, ' ')
    .trim()
}

const testCases = [
  '25歳の女子高生【オンエア版】',
  '【キャストオーディオコメンタリー付き】究極進化したフルダイブRPGが現実よりもクソゲーだったら',
  '【プライム会員なら3話までお試し見放題】アイドールズ！',
  '【プライム会員なら3話までお試し見放題】魔術士オーフェンはぐれ旅',
  '【特典付デジタルセル版】月とライカと吸血姫',
  '【獄・】さよなら絶望先生',
  '『キン肉マン』完璧超人始祖編',
  '『キン肉マン』完璧超人始祖編Season 2【プライム会員なら3話までお試し見放題】',
  '『ぐらんぶる』Season 2',
  '『やはり俺の青春ラブコメはまちがっている。』完',
  '『ワンパンマン』第2期',
  'やはり俺の青春ラブコメはまちがっている｡',
  'やはり俺の青春ラブコメはまちがっている｡続',
  'アイドールズ！(dアニメストア)',
  '180秒で君の耳を幸せにできるか？(dアニメストア)',
  '「鬼滅の刃」竈門炭治郎 立志編',
  '「鬼滅の刃」刀鍛冶の里編',
  '「鬼滅の刃」無限列車編',
  '「鬼滅の刃」柱稽古編',
  'DARKER THAN BLACK －黒の契約者－',
  'DARKER THAN BLACK －流星の双子 (ジェミニ)－',
  // cleanTitleでシーズン除去されるが、元タイトルでまずAniList検索するケース
  '「カノジョも彼女」Season2',
  'おそ松さん 第2期',
  'おそ松さん第3期',
]

console.log('cleanTitle + AniList search test:')
console.log('─'.repeat(70))

let found = 0
let notFound = 0

for (const title of testCases) {
  const cleaned = cleanTitle(title)
  // まず元タイトルで検索、ダメならクリーン版で
  let result = await searchAniList(title)
  let usedQuery = title
  if (!result && cleaned !== title) {
    await new Promise((r) => setTimeout(r, 700))
    result = await searchAniList(cleaned)
    usedQuery = cleaned
  }

  if (result) {
    found++
    console.log(`✓ "${title}" → cleaned: "${cleaned}" → "${result.title.native ?? result.title.romaji}" ${result.episodes ?? '?'}eps`)
  } else {
    notFound++
    console.log(`✗ "${title}" → cleaned: "${cleaned}" → NOT FOUND`)
  }
  await new Promise((r) => setTimeout(r, 700))
}

console.log(`\n${'='.repeat(70)}`)
console.log(`Found: ${found}, Not found: ${notFound}`)
