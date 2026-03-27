/**
 * 表示用に画像URLを整理する。
 * Amazon・Hulu の画像はクエリパラメータを含めてそのまま返す。
 * Hulu (images.prod.hjholdings.tv) はクエリパラメータでリサイズ済み webp を
 * 返すため、除去すると元画像（数MB の PNG）になり disk cache に入らない。
 */
export function getCleanImageUrl(url: string): string {
  return url
}
