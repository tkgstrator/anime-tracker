import { HuluEpisodeDetail, type HuluEpisodeDetail as HuluEpisodeDetailType } from '../../../schemas/hulu.dto'
import type { ProviderEpisode, ProviderSeason, ProviderTitleDetail } from '../../../schemas/provider.dto'
import { findMatchingBracket } from '../../html-parser'

const HULU_BASE = 'https://www.hulu.jp'
const HULU_FALCOR_API = `${HULU_BASE}/anon/ja/webp/path`

const KANJI_MAP: Record<string, number> = {
  一: 1,
  二: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
  十: 10
}

/**
 * 漢数字の文字列を数値に変換する。
 * @param s - 漢数字を含む文字列 (例: "十二")
 * @returns 変換された数値
 */
function parseKanjiNumber(s: string): number {
  const chars = [...s]
  let result = 0
  for (let i = 0; i < chars.length; i++) {
    const v = KANJI_MAP[chars[i]]
    if (v === undefined) continue
    if (v === 10) {
      result = (result || 1) * 10
    } else if (i + 1 < chars.length && KANJI_MAP[chars[i + 1]] === 10) {
      result += v * 10
      i++
    } else {
      result += v
    }
  }
  return result
}

/**
 * エピソード番号文字列を数値に変換する。アラビア数字優先、なければ漢数字をパースする。
 * @param episodeNumberTitle - エピソード番号文字列 (例: "第12話", "第十二話")
 * @returns エピソード番号
 */
function parseEpisodeNumber(episodeNumberTitle: string): number {
  const m = episodeNumberTitle.match(/(\d+)/)
  if (m) return Number.parseInt(m[1], 10)
  return parseKanjiNumber(episodeNumberTitle)
}

/**
 * 指定位置より前方で開き波括弧 '{' のインデックスを逆順に返すジェネレータ。
 * @param text - 検索対象の文字列
 * @param beforeIdx - この位置より前を検索する
 */
function* findOpenBraceIndices(text: string, beforeIdx: number): Generator<number> {
  for (const offset of Array.from({ length: Math.min(beforeIdx, 5000) }, (_, k) => beforeIdx - 1 - k)) {
    if (text[offset] === '{') yield offset
  }
}

/**
 * Next.js の RSC ストリーミングチャンクを結合して単一の文字列にする。
 * @param html - RSC ペイロードを含む HTML
 * @returns 結合された文字列
 */
function combineRscChunks(html: string): string {
  const chunks: string[] = []
  for (const m of html.matchAll(/self\.__next_f\.push\(\[1,"(.*?)"\]\)/gs)) {
    try {
      chunks.push(JSON.parse(`"${m[1]}"`))
    } catch {
      // skip broken chunks
    }
  }
  return chunks.join('')
}

/**
 * 結合済み RSC データから指定キーを含むエピソードオブジェクトを抽出する。
 * @param combined - 結合済み RSC 文字列
 * @param key - 検索キー (例: "episode_number_title")
 * @returns 抽出されたエピソード詳細の配列
 */
function extractByKey(combined: string, key: string): HuluEpisodeDetailType[] {
  const episodes: HuluEpisodeDetailType[] = []
  const seen = new Set<number>()
  for (const m of combined.matchAll(new RegExp(`"${key}"`, 'g'))) {
    const idx = m.index ?? 0
    for (const i of findOpenBraceIndices(combined, idx)) {
      try {
        const end = findMatchingBracket(combined, i, '{', '}', 10000)
        if (end < 0) continue
        const obj = JSON.parse(combined.slice(i, end))
        if (obj.additionalInfo?.type === 'media_meta' && obj.id && !seen.has(obj.id)) {
          seen.add(obj.id)
          episodes.push(HuluEpisodeDetail.parse(obj))
          break
        }
      } catch {
        // continue searching
      }
    }
  }
  return episodes
}

/**
 * HTML 内の RSC ペイロードからエピソード一覧を抽出する。
 * @param html - Hulu エピソードページの HTML
 * @returns エピソード詳細の配列
 */
export function extractEpisodesFromRsc(html: string): HuluEpisodeDetailType[] {
  const combined = combineRscChunks(html)

  // episode_number_title があればそれをキーに抽出
  const episodes = extractByKey(combined, 'episode_number_title')
  if (episodes.length > 0) return episodes

  // フォールバック: media_meta タイプのオブジェクトを抽出
  return extractByKey(combined, 'media_meta')
}

/**
 * Hulu のエピソード詳細を ProviderEpisode 型にマッピングする。
 * @param ep - Hulu のエピソード詳細
 * @param index - 配列内のインデックス (episode_number_title がない場合のフォールバック)
 * @returns マッピングされたエピソード。episodeNumber が 0 の場合は null
 */
function mapToProviderEpisode(ep: HuluEpisodeDetailType, index: number): ProviderEpisode | null {
  const episodeNumber = ep.additionalInfo.card_info.episode_number_title
    ? parseEpisodeNumber(ep.additionalInfo.card_info.episode_number_title)
    : index + 1
  if (episodeNumber === 0) return null
  return {
    episodeNumber,
    episodeId: String(ep.id_in_schema),
    title: ep.additionalInfo.short_name ?? ep.title,
    description: ep.description,
    releaseDate: ep.startAt,
    duration: Math.round(ep.additionalInfo.episode_runtime),
    maturityRating: null,
    imageUrl: ep.imageUrl,
    hasSubtitles: ep.additionalInfo.card_info.has_ja_caption ?? false,
    hasDub: false,
    benefitId: 'hulu'
  }
}

/**
 * Falcor JSON Graph API からシリーズの description を取得する。
 * @param seriesId - シリーズの id_in_schema (例: 500007892)
 * @returns シリーズの description。取得できない場合は空文字
 */
async function fetchSeriesDescription(seriesId: number): Promise<string> {
  const paths = JSON.stringify([['meta', `series:${seriesId}`, ['description']]])
  const url = `${HULU_FALCOR_API}?paths=${encodeURIComponent(paths)}&method=get`
  const res = await fetch(url)
  if (!res.ok) return ''
  const data = (await res.json()) as {
    jsonGraph: { meta: Record<string, { description?: { value?: string } }> }
  }
  return data.jsonGraph.meta[`series:${seriesId}`]?.description?.value ?? ''
}

/**
 * Hulu のタイトル詳細ページからエピソード・シーズン情報を取得する。
 * @param slug - Hulu のスラッグ (例: "dandadan")
 * @returns タイトル詳細情報
 * @throws HTTP エラー時
 */
export async function fetchHuluTitleDetail(slug: string): Promise<ProviderTitleDetail> {
  const url = `${HULU_BASE}/${slug}/assets?ht=episode`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Hulu episode page error: ${res.status} ${res.statusText} (${url})`)
  }
  const html = await res.text()
  const rawEpisodes = extractEpisodesFromRsc(html)

  // タイトル推定
  const firstEp = rawEpisodes[0]
  const seriesTitle = firstEp ? firstEp.title.replace(/\s+シーズン\d+.*/, '').replace(/\s+第\d+話.*/, '') : slug

  // シーズンごとにグループ化
  const seasonMap = new Map<string, HuluEpisodeDetailType[]>()
  for (const ep of rawEpisodes) {
    const seasonName = ep.additionalInfo.card_info.season_number_title ?? 'シーズン1'
    const list = seasonMap.get(seasonName) ?? []
    list.push(ep)
    seasonMap.set(seasonName, list)
  }

  const seasons: ProviderSeason[] = Array.from(seasonMap.entries(), ([seasonName, eps], i) => {
    const episodes = eps.map((ep, idx) => mapToProviderEpisode(ep, idx)).filter((e): e is ProviderEpisode => e !== null)
    return {
      seasonId: `hulu-${slug}-s${i + 1}`,
      displayName: seasonName,
      seasonNumber: i + 1,
      imageUrl: episodes[0]?.imageUrl ?? null,
      episodes
    }
  })

  const seriesId = rawEpisodes[0]?.additionalInfo.series_id
  const description = seriesId ? await fetchSeriesDescription(seriesId) : ''

  return {
    title: seriesTitle,
    description,
    entityType: 'tv',
    maturityRating: null,
    imageUrl: seasons[0]?.imageUrl ?? null,
    benefitId: 'hulu',
    seasons
  }
}
