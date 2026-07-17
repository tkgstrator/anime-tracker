/**
 * Lambda ハンドラが返すレスポンスの構築ヘルパー。
 * ok / zodFail / handleRoute はいずれも LambdaResponse を返す共通形。
 */
import type { z } from 'zod'

/** Lambda 側に返す最小限のレスポンス形状。API Gateway proxy 相当のフィールドセット。 */
export type LambdaResponse = { statusCode: number; body: string }

/** 200 OK + JSON body の LambdaResponse を作る。 */
export const ok = <T>(data: T): LambdaResponse => ({
  statusCode: 200,
  body: JSON.stringify(data)
})

/** Zod のバリデーションエラーを 400/500 の LambdaResponse に変換する。 */
export const zodFail = (
  status: number,
  label: 'request' | 'response',
  error: z.ZodError
): LambdaResponse => ({
  statusCode: status,
  body: JSON.stringify({ error: `Invalid ${label}`, issues: error.issues })
})

/**
 * request schema で入力を検証 → ハンドラ実行 → response schema で出力を検証 して返す共通ラッパー。
 * request 失敗は 400、response 失敗は 500。ハンドラ内 throw は呼び出し元 handler の catch で 500 化される。
 */
export async function handleRoute<Req, Res>(
  body: unknown,
  requestSchema: z.ZodType<Req>,
  responseSchema: z.ZodType<Res>,
  run: (input: Req) => Promise<Res>
): Promise<LambdaResponse> {
  const requestParsed = requestSchema.safeParse(body)
  if (!requestParsed.success) return zodFail(400, 'request', requestParsed.error)
  const output = await run(requestParsed.data)
  const responseParsed = responseSchema.safeParse(output)
  if (!responseParsed.success) return zodFail(500, 'response', responseParsed.error)
  return ok(responseParsed.data)
}
