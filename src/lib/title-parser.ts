/**
 * タイトル文字列からシーズン番号を抽出する。
 *
 * 「第2期」「シーズン3」「Season 2」「2nd Season」「2ndシーズン」「2期」等のパターンを認識する。
 * 「2nd GIG」「2nd Attack」のようにシーズンを意味しない序数はマッチしない。
 * @param title - アニメタイトル
 * @returns 検出されたシーズン番号。検出できない場合は 1
 */
export function extractSeasonNumber(title: string): number {
  const patterns: RegExp[] = [
    /第(\d+)期/, // 第2期
    /シーズン(\d+)/, // シーズン2
    /(\d+)(?:st|nd|rd|th)\s*(?:Season|シーズン)/i, // 2nd Season, 2ndシーズン（Season\s*Nより先に評価）
    /Season\s*(\d+)/i, // Season 2, Season2
    /(\d+)期(?![a-zA-Z\u4e00-\u9fff])/ // 2期（直後が英字・漢字でない場合のみ）
  ]

  for (const pattern of patterns) {
    const m = title.match(pattern)
    if (m) return Number.parseInt(m[1], 10)
  }

  // "2nd" 等の序数のみ（末尾に位置する場合のみ）
  const ordinalMatch = title.match(/(\d+)(?:st|nd|rd|th)\s*$/)
  if (ordinalMatch) return Number.parseInt(ordinalMatch[1], 10)

  return 1
}
