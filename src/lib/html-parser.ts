/**
 * HTML 中に埋め込まれた JSON 断片を切り出すためのユーティリティ。
 *
 * `text[start]` の open bracket に対応する close bracket の直後のインデックスを返す。
 * 見つからなければ -1。最大 maxLen 文字まで探索する。
 */
export function findMatchingBracket(
  text: string,
  start: number,
  open: string,
  close: string,
  maxLen = 100_000
): number {
  const limit = Math.min(start + maxLen, text.length)
  const state = { depth: 0 }
  const found = text
    .slice(start, limit)
    .split('')
    .findIndex((ch) => {
      state.depth += ch === open ? 1 : ch === close ? -1 : 0
      return state.depth === 0
    })
  return found < 0 ? -1 : start + found + 1
}
