/**
 * fetch のリトライ / 並列制御ヘルパー。
 * AniList や ABEMA 系の外部 API 呼び出しに共通で使う。
 */
import { logger } from './logger'

/** 外部 API 呼び出しのリトライ最大回数のデフォルト。 */
export const DEFAULT_MAX_RETRIES = 4

/** リトライ待機時間の絶対上限 (秒)。 */
export const RETRY_BACKOFF_CEILING_SEC = 60

/** リトライすべき HTTP ステータスかどうかを判定する。429 と 5xx を対象にする。 */
function isRetriableStatus(status: number): boolean {
  return status === 429 || (status >= 500 && status < 600)
}

/**
 * fetch を実行しつつ、429 / 5xx / ネットワークエラーで指数バックオフリトライする。
 * Retry-After (秒) が返ってきた場合はそれを優先する。上限は {@link RETRY_BACKOFF_CEILING_SEC}。
 *
 * @param url   fetch する URL
 * @param init  fetch オプション
 * @param maxRetries  リトライ最大回数 (デフォルト {@link DEFAULT_MAX_RETRIES})
 * @returns 最終的な Response。リトライ後も 4xx/5xx が続く場合はそのまま返す。
 * @throws  最後の attempt でもネットワークエラーが起きた場合はその error を再 throw する。
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  maxRetries: number = DEFAULT_MAX_RETRIES
): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, init)
      if (attempt === maxRetries || !isRetriableStatus(res.status)) return res

      const retryAfterHeader = Number(res.headers.get('Retry-After'))
      const backoff = Number.isFinite(retryAfterHeader) && retryAfterHeader > 0 ? retryAfterHeader : 2 ** attempt
      const waitSec = Math.min(backoff, RETRY_BACKOFF_CEILING_SEC)
      logger.warn({
        action: 'fetch-retry',
        url,
        status: res.status,
        attempt: attempt + 1,
        maxRetries,
        waitSec
      })
      await new Promise((r) => setTimeout(r, waitSec * 1000))
    } catch (e) {
      if (attempt === maxRetries) throw e
      const waitSec = Math.min(2 ** attempt, RETRY_BACKOFF_CEILING_SEC)
      logger.warn({
        action: 'fetch-retry-network',
        url,
        error: e instanceof Error ? e.message : String(e),
        attempt: attempt + 1,
        maxRetries,
        waitSec
      })
      await new Promise((r) => setTimeout(r, waitSec * 1000))
    }
  }
  // 到達しない (ループ内で return / throw する) が、TypeScript の網羅性のために置く
  throw new Error('fetchWithRetry: unreachable')
}

/**
 * items を limit 並列で fn に投げ、順序を保った結果配列を返す。
 * chunk 単位で await するので、chunk 内で最遅の promise が全体を律速する。
 *
 * @param items  処理対象のリスト
 * @param limit  同時実行の上限
 * @param fn     各要素を非同期処理するコールバック (要素と index を受け取る)
 * @returns items と同じ順序の結果配列
 */
export async function runWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  for (let i = 0; i < items.length; i += limit) {
    const chunkIndices = Array.from({ length: Math.min(limit, items.length - i) }, (_, k) => i + k)
    const chunk = await Promise.all(chunkIndices.map((idx) => fn(items[idx], idx)))
    for (let j = 0; j < chunk.length; j++) {
      results[chunkIndices[j]] = chunk[j]
    }
  }
  return results
}
