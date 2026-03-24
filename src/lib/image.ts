/**
 * 表示用に画像URLを整理する。
 * Amazon の画像はロゴオーバーレイ付きバナーとしてそのまま使用し、
 * 他のプロバイダはクエリパラメータを除去して元画像を取得する。
 */
export function getCleanImageUrl(url: string): string {
  const parsed = new URL(url)

  // Amazon: バナー画像（ロゴオーバーレイ含む）はそのまま返す
  if (parsed.hostname === 'm.media-amazon.com') {
    return url
  }

  // クエリパラメータ (?w=331&h=447&q=80 等) を除去して元画像を取得
  parsed.search = ''
  return parsed.href
}
