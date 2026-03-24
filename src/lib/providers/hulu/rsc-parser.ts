import { findMatchingBracket } from '../../html-parser'

/**
 * Next.js の RSC ストリーミングチャンクを結合して単一の文字列にする。
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
 * HTML 内の RSC ペイロードから "metas" 配列を抽出する。
 * @param html - Hulu エピソードページの HTML
 * @returns パース済みの metas 配列 (unknown[])
 */
export function extractMetasArray(html: string): unknown[] {
  const combined = combineRscChunks(html)
  const marker = '"metas":['
  const idx = combined.indexOf(marker)
  if (idx < 0) return []

  const arrStart = idx + marker.length - 1 // '[' の位置
  const arrEnd = findMatchingBracket(combined, arrStart, '[', ']', 500_000)
  if (arrEnd < 0) return []

  return JSON.parse(combined.slice(arrStart, arrEnd)) as unknown[]
}
