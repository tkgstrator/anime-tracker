/**
 * 日本 IP が必要な fetch を代行する Lambda ハンドラ。
 *
 * AWS Lambda (ap-northeast-1) で実行し、日本 IP からの fetch を保証する。
 * fetch → 整形 → レスポンスとして返す。KV/DB は触らない。
 * パスベースルーティング:
 *   POST /expiring     — 配信終了間近タイトル取得
 *   POST /title_list   — 新着エピソード / 最近更新タイトル取得
 *   POST /title_info   — タイトル詳細取得
 */
// import { AwsClient } from 'aws4fetch'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import type { z } from 'zod'
import {
  FetchAbemaArchiveRequestSchema,
  FetchAbemaArchiveResponseSchema,
  ExpiringResponseSchema,
  FetchExpiringRequestSchema,
  FetchTitleInfoRequestSchema,
  FetchTitleListRequestSchema,
  IdentifyRequestSchema,
  IdentifyResponseSchema,
  TitleListResponseSchema
} from '../../src/schemas/lambda.dto'
import { TitleInfoSchema } from '../../src/schemas/providers/common.dto'
import { MetadataMediaSchema } from '../../src/schemas/providers/metadata.dto'
import { cleanTitle } from '../../src/lib/metadata/anilist'
import { setupLogger } from '../../src/lib/logger'
import { getGuestSession } from '../../src/lib/providers/abema/auth'
import { buildKeysArchive, fetchMediaToken } from '../../src/lib/providers/abema/hls'
import { AbemaProvider } from '../../src/lib/providers/abema'
import { AmazonProvider } from '../../src/lib/providers/amazon'
import type { Provider } from '../../src/lib/providers/base'
import { CrunchyrollProvider } from '../../src/lib/providers/crunchyroll'
import { HuluProvider } from '../../src/lib/providers/hulu'

dayjs.extend(utc)
setupLogger()

function getProvider(name: string): Provider {
  if (name === 'hulu') return new HuluProvider()
  if (name === 'crunchyroll') return new CrunchyrollProvider()
  if (name === 'abema') return new AbemaProvider()
  return new AmazonProvider()
}

// ---- R2 画像アップロード (現在未使用: Workers の Smart Placement で対応中) ----
//
// function createR2Client() {
//   const accessKeyId = process.env.R2_ACCESS_KEY_ID
//   const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
//   const accountId = process.env.R2_ACCOUNT_ID
//   if (!accessKeyId || !secretAccessKey || !accountId) {
//     return null
//   }
//   const aws = new AwsClient({ accessKeyId, secretAccessKey })
//   const endpoint = `https://${accountId}.r2.cloudflarestorage.com`
//   return { aws, endpoint }
// }
//
// async function uploadToR2(imageUrl: string): Promise<boolean> {
//   const r2 = createR2Client()
//   if (!r2) {
//     console.warn('R2 credentials not configured, skipping image upload')
//     return false
//   }
//
//   const key = imageKey(imageUrl)
//   const bucket = process.env.R2_BUCKET_NAME ?? 'nagisa-images'
//   const r2Url = `${r2.endpoint}/${bucket}/${key}`
//
//   const headRes = await r2.aws.fetch(r2Url, { method: 'HEAD' })
//   if (headRes.ok) return true
//
//   const res = await fetch(imageUrl)
//   if (!res.ok) {
//     console.warn(`Failed to fetch image: ${res.status} ${imageUrl}`)
//     return false
//   }
//
//   const body = await res.arrayBuffer()
//   const contentType = res.headers.get('content-type') ?? 'image/jpeg'
//
//   const putRes = await r2.aws.fetch(r2Url, {
//     method: 'PUT',
//     headers: { 'Content-Type': contentType },
//     body
//   })
//
//   if (!putRes.ok) {
//     console.warn(`Failed to upload to R2: ${putRes.status} ${key}`)
//     return false
//   }
//
//   console.log(`Uploaded: ${key}`)
//   return true
// }
//
// async function uploadImages(imageUrls: string[]): Promise<number> {
//   const urls = imageUrls.filter(Boolean)
//   if (urls.length === 0) return 0
//
//   const results = await Promise.allSettled(urls.map((url) => uploadToR2(url)))
//   const uploaded = results.filter((r) => r.status === 'fulfilled' && r.value).length
//   console.log(`Uploaded ${uploaded}/${urls.length} images`)
//   return uploaded
// }

// ---- expiring ----

async function fetchExpiring(provider: string) {
  const p = getProvider(provider)
  const titles = await p.fetchTitleList({ category: 'expiring' })

  const now = dayjs()
  const entries = titles
    .filter((t) => t.expiring)
    .map((t) => {
      const raw = now.add(t.expiring!.remainingHours, 'hour')
      const expiredAt = raw.utcOffset(9).startOf('day').toISOString()
      return {
        contentId: t.contentId,
        expiredAt,
        expiringSeason: t.expiring!.season
      }
    })

  console.log(`Fetched ${entries.length} expiring entries for ${provider}`)
  return { fetchedAt: now.toISOString(), entries }
}

// ---- title_list (new_episode / coming_soon) ----

async function fetchTitleList(providerName: string, category: 'new_episode' | 'coming_soon' | 'catalog') {
  const provider = getProvider(providerName)
  const titles = await provider.fetchTitleList({ category })

  const entries = titles.map((t) => ({
    contentId: t.contentId,
    title: t.title,
    description: t.description,
    entityType: t.entityType,
    imageUrl: t.imageUrl,
    maturityRating: t.maturityRating,
    nextEpisodeDate: t.nextEpisodeDate,
    badge: t.badge
  }))

  console.log(`Fetched ${entries.length} ${category} entries for ${providerName}`)
  return { fetchedAt: dayjs().toISOString(), entries }
}

// ---- title_info ----

async function fetchTitleInfo(providerName: string, contentId: string) {
  const provider = getProvider(providerName)
  const detail = await provider.fetchTitleInfo(contentId)

  console.log(
    `Fetched title_info for ${providerName}/${contentId}: ${detail.seasons.length} seasons`
  )
  return detail
}

// ---- title_info (abema archive mode) ----

async function fetchAbemaArchives(programIds: string[], targetHeight = 0) {
  const session = await getGuestSession()
  const mediaToken = await fetchMediaToken({ bearer: session.token })
  const results = await Promise.all(
    programIds.map(async (programId) => {
      try {
        const archive = await buildKeysArchive({
          programId,
          mediaToken,
          deviceId: session.deviceId,
          targetHeight
        })
        return {
          programId,
          ok: true as const,
          archive: {
            programId: archive.programId,
            cid: archive.cid,
            contentKeyHex: archive.contentKeyHex,
            ivHex: archive.ivHex,
            variantUrl: archive.variantUrl,
            variantResolution: archive.variantResolution,
            variantBandwidth: archive.variantBandwidth,
            segmentUrls: archive.segmentUrls
          }
        }
      } catch (e) {
        return {
          programId,
          ok: false as const,
          error: e instanceof Error ? e.message : String(e)
        }
      }
    })
  )
  const okCount = results.filter((r) => r.ok).length
  console.log(`Fetched ${okCount}/${programIds.length} ABEMA key archives`)
  return { results }
}

// ---- identify ----

const ANILIST_API = 'https://graphql.anilist.co'

const MEDIA_FIELDS = `
  id
  title { native }
  countryOfOrigin
  status
  season
  seasonYear
  startDate { year month day }
`

function buildBatchQuery(searches: string[]): string {
  const fragments = searches.map(
    (search, i) =>
      `q${i}: Page(perPage: 5) { media(search: ${JSON.stringify(search)}, type: ANIME) { ${MEDIA_FIELDS} } }`
  )
  return `query { ${fragments.join('\n')} }`
}

const SEASON_TO_QUARTER: Record<string, number> = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  FALL: 3
}

const MONTH_TO_QUARTER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] as const

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 429) return res
  const retryAfter = Math.min(Number(res.headers.get('Retry-After') || '2'), 5)
  await new Promise((r) => setTimeout(r, retryAfter * 1000))
  return fetch(url, init)
}

async function identifyTitles(rawTitles: string[]): Promise<{ results: (z.infer<typeof IdentifyResponseSchema>['results'][number])[] } | { upstreamStatus: number }> {
  if (rawTitles.length === 0) return { results: [] }

  const searches = rawTitles.map((t) => cleanTitle(t))
  const query = buildBatchQuery(searches)

  const res = await fetchWithRetry(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query })
  })

  if (!res.ok) {
    console.error(`AniList API error: ${res.status}`)
    return { upstreamStatus: res.status }
  }

  const data = (await res.json()) as { data: Record<string, { media: unknown[] }> }

  const results = searches.map((_, i) => {
    const page = data.data[`q${i}`]
    if (!page?.media?.length) return null
    const result = MetadataMediaSchema.safeParse(page.media[0])
    if (!result.success) {
      console.warn(`[identify] schema validation failed for index ${i}:`, result.error.message)
      return null
    }
    const media = result.data

    const year = media.seasonYear ?? media.startDate.year
    const quarter = media.season
      ? SEASON_TO_QUARTER[media.season]
      : media.startDate.month
        ? MONTH_TO_QUARTER[media.startDate.month - 1]
        : null
    if (year == null || quarter == null) return null

    return {
      aniListId: media.id,
      title: media.title.native,
      status: media.status,
      year,
      quarter
    }
  })

  console.log(`Identified ${results.filter(Boolean).length}/${rawTitles.length} titles`)
  return { results }
}

// ---- handler ----

type LambdaResponse = { statusCode: number; body: string }

const ok = <T>(data: T): LambdaResponse => ({ statusCode: 200, body: JSON.stringify(data) })

const zodFail = (status: number, label: 'request' | 'response', error: z.ZodError): LambdaResponse => ({
  statusCode: status,
  body: JSON.stringify({ error: `Invalid ${label}`, issues: error.issues })
})

async function handleRoute<Req, Res>(
  body: unknown,
  requestSchema: z.ZodType<Req>,
  responseSchema: z.ZodType<Res>,
  run: (input: Req) => Promise<Res>
): Promise<LambdaResponse> {
  const result = requestSchema.safeParse(body)
  if (!result.success) return zodFail(400, 'request', result.error)
  const output = await run(result.data)
  {
    const result = responseSchema.safeParse(output)
    if (!result.success) return zodFail(500, 'response', result.error)
    return ok(result.data)
  }
}

// biome-ignore lint: Lambda event type varies by invocation method
export async function handler(event: any): Promise<LambdaResponse> {
  const path = event.rawPath ?? event.path ?? '/'
  const body = event.body ? JSON.parse(event.body) : event

  console.log(`${path}`)

  try {
    switch (path) {
      case '/expiring':
        return await handleRoute(body, FetchExpiringRequestSchema, ExpiringResponseSchema, ({ provider }) => {
          console.log(`provider=${provider}`)
          return fetchExpiring(provider)
        })
      case '/title_list':
        return await handleRoute(body, FetchTitleListRequestSchema, TitleListResponseSchema, ({ provider, category }) => {
          console.log(`provider=${provider} category=${category}`)
          return fetchTitleList(provider, category)
        })
      case '/title_info':
        {
          const result = FetchAbemaArchiveRequestSchema.safeParse(body)
          if (result.success) {
            console.log(`programIds=${result.data.programIds.length} targetHeight=${result.data.targetHeight ?? 0}`)
            const output = await fetchAbemaArchives(result.data.programIds, result.data.targetHeight ?? 0)
            {
              const result = FetchAbemaArchiveResponseSchema.safeParse(output)
              if (!result.success) return zodFail(500, 'response', result.error)
              return ok(result.data)
            }
          }
          return await handleRoute(body, FetchTitleInfoRequestSchema, TitleInfoSchema, ({ provider, contentId }) => {
            console.log(`provider=${provider} contentId=${contentId}`)
            return fetchTitleInfo(provider, contentId)
          })
        }
      case '/identify': {
        const result = IdentifyRequestSchema.safeParse(body)
        if (!result.success) return zodFail(400, 'request', result.error)
        console.log(`titles count=${result.data.titles.length}`)
        const output = await identifyTitles(result.data.titles)
        if ('upstreamStatus' in output) {
          return { statusCode: 502, body: JSON.stringify({ error: `AniList API error: ${output.upstreamStatus}` }) }
        }
        {
          const result = IdentifyResponseSchema.safeParse(output)
          if (!result.success) return zodFail(500, 'response', result.error)
          return ok(result.data)
        }
      }
      default:
        return { statusCode: 404, body: JSON.stringify({ error: `Unknown path: ${path}` }) }
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    const stack = e instanceof Error ? e.stack : undefined
    console.error(`Unhandled error on ${path}:`, message, stack)
    return { statusCode: 500, body: JSON.stringify({ error: message }) }
  }
}
