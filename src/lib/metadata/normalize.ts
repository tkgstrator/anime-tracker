/**
 * AniList の native/romaji/english title と provider タイトルを matching するための
 * 正規化関数。大文字小文字・空白・記号を取り除いて比較キーにする。
 */
export function normalizeTitle(s: string | null | undefined): string {
  if (!s) return ''
  return (
    s
      .toLowerCase()
      // 全角ASCII → 半角
      .replace(/[！-～]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
      // 全角・半角空白
      .replace(/[\s　]+/g, '')
      // 句読点・記号類 (日英)
      .replace(/[!?.,'"():;\-—–~～「」『』【】［］[\]()<>＜＞{}・･♡♥★☆♪♫※/\\|]/g, '')
      // 残った句読点
      .replace(/[。、，．]/g, '')
  )
}
