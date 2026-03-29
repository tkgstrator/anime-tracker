import { AwsClient } from 'aws4fetch'
import type { z } from 'zod'
import {
  ExpiringResponseSchema,
  type FetchExpiringRequestSchema,
  type FetchTitleInfoRequestSchema,
  type FetchTitleListRequestSchema,
  TitleListResponseSchema
} from '@/schemas/lambda.dto.ts'
import { TitleInfoSchema } from '@/schemas/providers/common.dto.ts'
import { getAppLogger } from './logger'

const logger = getAppLogger('lambda')

interface LambdaEnv {
  AWS_ACCESS_KEY_ID: string
  AWS_SECRET_ACCESS_KEY: string
  LAMBDA_FUNCTION_URL: string
}

/**
 * Lambda Function URL に SigV4 署名付き POST リクエストを送る。
 */
async function post<T>(aws: AwsClient, baseUrl: string, path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  logger.info({ action: 'invoke-lambda', path })

  const response = await aws.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Lambda invocation failed: ${response.status} ${text}`)
  }

  const data = await response.json()
  logger.info({ action: 'lambda-success', path })
  return schema.parse(data)
}

/**
 * Lambda fetch API クライアントを作成する。
 */
export function createLambdaClient(env: LambdaEnv) {
  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  })
  const baseUrl = env.LAMBDA_FUNCTION_URL

  return {
    fetchExpiring: (body: z.infer<typeof FetchExpiringRequestSchema>) =>
      post(aws, baseUrl, '/expiring', body, ExpiringResponseSchema),
    fetchTitleList: (body: z.infer<typeof FetchTitleListRequestSchema>) =>
      post(aws, baseUrl, '/title_list', body, TitleListResponseSchema),
    fetchTitleInfo: (body: z.infer<typeof FetchTitleInfoRequestSchema>) =>
      post(aws, baseUrl, '/title_info', body, TitleInfoSchema)
  }
}
