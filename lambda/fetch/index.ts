/**
 * 日本 IP が必要な fetch を代行する Lambda ハンドラ (entry point)。
 *
 * AWS Lambda (ap-northeast-1) で実行し、日本 IP からの fetch を保証する。
 * fetch → 整形 → レスポンスとして返す。KV/DB は触らない。
 *
 * パスベースルーティング:
 *   POST /expiring       — 配信終了間近タイトル取得
 *   POST /title_list     — 新着エピソード / 最近更新タイトル取得
 *   POST /title_info     — タイトル詳細取得
 *   POST /abema_archive  — ABEMA archive key/segment fetch
 *   POST /identify       — AniList でタイトルを検索して aniListId 等を返す
 *
 * 実処理は handlers/ 配下に分割している。このファイルは entry と routing のみ。
 */
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import { setupLogger } from '../../src/lib/logger'
import {
  ExpiringResponseSchema,
  FetchAbemaArchiveRequestSchema,
  FetchAbemaArchiveResponseSchema,
  FetchExpiringRequestSchema,
  FetchTitleInfoRequestSchema,
  FetchTitleListRequestSchema,
  IdentifyRequestSchema,
  IdentifyResponseSchema,
  TitleListResponseSchema
} from '../../src/schemas/lambda.dto'
import { TitleInfoSchema } from '../../src/schemas/providers/common.dto'
import { parseEvent } from './event'
import { fetchAbemaArchives } from './handlers/abema-archive'
import { fetchExpiring } from './handlers/expiring'
import { identifyTitles } from './handlers/identify'
import { fetchTitleInfo } from './handlers/title-info'
import { fetchTitleList } from './handlers/title-list'
import { logger } from './logger'
import { handleRoute, type LambdaResponse, ok, zodFail } from './response'

dayjs.extend(utc)
setupLogger()

/**
 * Lambda entry point。
 * event を parseEvent で正規化し、path でルーティングして各 fetch 関数に委譲する。
 * 400 (bad request) / 404 (unknown path) / 500 (unhandled error) / 502 (upstream error) を返し得る。
 */
export async function handler(event: unknown): Promise<LambdaResponse> {
  const { path, body, requestId, bodyParseError } = parseEvent(event)

  logger.info({ action: 'request', path, requestId })

  if (bodyParseError) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON body' }) }
  }

  try {
    switch (path) {
      case '/expiring':
        return await handleRoute(body, FetchExpiringRequestSchema, ExpiringResponseSchema, ({ provider }) => {
          logger.debug({ action: 'route-expiring', provider, requestId })
          return fetchExpiring(provider)
        })
      case '/title_list':
        return await handleRoute(
          body,
          FetchTitleListRequestSchema,
          TitleListResponseSchema,
          ({ provider, category }) => {
            logger.debug({ action: 'route-title-list', provider, category, requestId })
            return fetchTitleList(provider, category)
          }
        )
      case '/title_info':
        return await handleRoute(
          body,
          FetchTitleInfoRequestSchema,
          TitleInfoSchema,
          ({ provider, contentId }) => {
            logger.debug({ action: 'route-title-info', provider, contentId, requestId })
            return fetchTitleInfo(provider, contentId)
          }
        )
      case '/abema_archive':
        return await handleRoute(
          body,
          FetchAbemaArchiveRequestSchema,
          FetchAbemaArchiveResponseSchema,
          ({ programIds, targetHeight }) => {
            logger.debug({
              action: 'route-abema-archive',
              count: programIds.length,
              targetHeight: targetHeight ?? 0,
              requestId
            })
            return fetchAbemaArchives(programIds, targetHeight ?? 0)
          }
        )
      case '/identify': {
        const requestParsed = IdentifyRequestSchema.safeParse(body)
        if (!requestParsed.success) return zodFail(400, 'request', requestParsed.error)
        logger.debug({ action: 'route-identify', count: requestParsed.data.titles.length, requestId })
        const outcome = await identifyTitles(requestParsed.data.titles)
        if (outcome.kind === 'upstream_error') {
          return {
            statusCode: 502,
            body: JSON.stringify({ error: `AniList API error: ${outcome.upstreamStatus}` })
          }
        }
        const responseParsed = IdentifyResponseSchema.safeParse({ results: outcome.results })
        if (!responseParsed.success) return zodFail(500, 'response', responseParsed.error)
        return ok(responseParsed.data)
      }
      default:
        return { statusCode: 404, body: JSON.stringify({ error: `Unknown path: ${path}` }) }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : undefined
    logger.error({ action: 'unhandled-error', path, requestId, message, stack })
    return { statusCode: 500, body: JSON.stringify({ error: message }) }
  }
}
