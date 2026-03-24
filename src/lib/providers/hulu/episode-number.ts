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
export function parseEpisodeNumber(episodeNumberTitle: string): number {
  const m = episodeNumberTitle.match(/(\d+)/)
  if (m) return Number.parseInt(m[1], 10)
  return parseKanjiNumber(episodeNumberTitle)
}
