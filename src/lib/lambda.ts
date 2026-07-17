import { AwsClient } from 'aws4fetch'
import type { z } from 'zod'
import {
  ExpiringResponseSchema,
  type FetchAbemaArchiveRequestSchema,
  FetchAbemaArchiveResponseSchema,
  type FetchExpiringRequestSchema,
  type FetchTitleInfoRequestSchema,
  type FetchTitleListRequestSchema,
  IdentifyResponseSchema,
  TitleListResponseSchema
} from '@/schemas/lambda.dto.ts'
import { TitleInfoSchema } from '@/schemas/providers/common.dto.ts'
import { getAppLogger } from './logger'

const logger = getAppLogger('lambda')

interface FetchClientEnv {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  LAMBDA_FUNCTION_URL: string
  LAMBDA_FUNCTION_URL_US?: string
}

/** Crunchyroll は US Lambda、それ以外は JP Lambda を使う */
function getBaseUrl(env: FetchClientEnv, provider: string): string {
  if (provider === 'crunchyroll' && env.LAMBDA_FUNCTION_URL_US) {
    return env.LAMBDA_FUNCTION_URL_US
  }
  return env.LAMBDA_FUNCTION_URL
}

/**
 * Lambda Function URL に SigV4 署名付き POST リクエストを送る。
 */
async function post<T>(
  aws: AwsClient,
  baseUrl: string,
  path: string,
  body: unknown,
  schema: z.ZodType<T>,
  maxRetries = 4
): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const payload = JSON.stringify(body)

  for (let attempt = 0; ; attempt++) {
    const startedAt = Date.now()
    const response = await aws.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    })
    const elapsedMs = Date.now() - startedAt

    if (response.ok) {
      const data = await response.json()
      logger.info({ action: 'lambda-invoke', path, status: response.status, elapsedMs })
      const result = schema.safeParse(data)
      if (!result.success) throw result.error
      return result.data
    }

    // AWS Lambda の同時実行上限 (429 ConcurrentInvocationLimitExceeded) は一過性なのでバックオフ再試行
    if (response.status === 429 && attempt < maxRetries) {
      const waitMs = Math.min(1000 * 2 ** attempt, 30000)
      logger.warn({ action: 'lambda-429-retry', path, attempt: attempt + 1, waitMs, elapsedMs })
      await new Promise((r) => setTimeout(r, waitMs))
      continue
    }

    const text = await response.text()
    logger.error({ action: 'lambda-invoke', path, status: response.status, elapsedMs })
    throw new Error(`Lambda invocation failed: ${response.status} ${text}`)
  }
}

/**
 * Lambda fetch API クライアントを作成する。
 */
export type FetchClient = ReturnType<typeof createFetchClient>

export function createFetchClient(env: FetchClientEnv) {
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  })

  return {
    fetchExpiring: (body: z.infer<typeof FetchExpiringRequestSchema>) =>
      post(aws, getBaseUrl(env, body.provider), '/expiring', body, ExpiringResponseSchema),
    fetchTitleList: (body: z.infer<typeof FetchTitleListRequestSchema>) =>
      post(aws, getBaseUrl(env, body.provider), '/title_list', body, TitleListResponseSchema),
    fetchTitleInfo: (body: z.infer<typeof FetchTitleInfoRequestSchema>) =>
      post(aws, getBaseUrl(env, body.provider), '/title_info', body, TitleInfoSchema),
    fetchAbemaArchives: (body: z.infer<typeof FetchAbemaArchiveRequestSchema>) =>
      post(aws, getBaseUrl(env, 'abema'), '/abema_archive', body, FetchAbemaArchiveResponseSchema),
    identifyTitles: (body: { titles: string[] }) =>
      post(aws, env.LAMBDA_FUNCTION_URL, '/identify', body, IdentifyResponseSchema)
  }
}
