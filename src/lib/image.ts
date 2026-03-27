/**
 * 外部画像を自ドメインの画像プロキシ経由の URL に変換する。
 * 同一オリジンになるためブラウザの disk cache が確実に効く。
 */
export function getCleanImageUrl(url: string): string {
  return `/api/img?url=${encodeURIComponent(url)}`
}
