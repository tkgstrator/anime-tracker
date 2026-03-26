/**
 * Prime Video の highValueMessage からPrime配信終了までの残り時間を抽出する。
 *
 * @example
 * ```
 * parseExpiringMessage('シーズン1のPrimeでの配信は6日以内に終了')
 * // => { season: 1, remainingHours: 144 }
 *
 * parseExpiringMessage('Primeでの配信は34時間以内に終了')
 * // => { season: null, remainingHours: 34 }
 * ```
 *
 * @param message - highValueMessage.message の文字列
 * @returns パース結果。配信終了メッセージでない場合は null
 */
export function parseExpiringMessage(message: string): { season: number | null; remainingHours: number } | null {
  const match = message.match(/(?:シーズン(\d+)の)?Primeでの配信は(\d+)(日|時間)以内に終了/)
  if (!match) return null
  const season = match[1] ? Number.parseInt(match[1], 10) : null
  const value = Number.parseInt(match[2], 10)
  const remainingHours = match[3] === '日' ? value * 24 : value
  return { season, remainingHours }
}
