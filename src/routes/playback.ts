import { createRoute, OpenAPIHono, z } from '@hono/zod-openapi'
import { createPrismaClient } from '../lib/db'
import { getAppLogger } from '../lib/logger'

const logger = getAppLogger('playback')

type Bindings = {
  DB: D1Database
}

const playback = new OpenAPIHono<{ Bindings: Bindings }>()

/** 16 byte hex → base64 (data: URI 用) */
function hexToBase64(hex: string): string {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.substr(i * 2, 2), 16)
  return btoa(String.fromCharCode(...bytes))
}

/** segment 名から推定 duration (絶対正確ではないが ABEMA は概ね一定値) */
const DEFAULT_SEGMENT_DURATION = 5.0

playback.openapi(
  createRoute({
    method: 'get',
    path: '/abema/:episodeId/index.m3u8',
    tags: ['Playback'],
    summary: '保存済み AES-128 鍵をインライン化した HLS m3u8 を返す',
    request: { params: z.object({ episodeId: z.string().nonempty() }) },
    responses: {
      200: { description: 'm3u8', content: { 'application/vnd.apple.mpegurl': { schema: z.string() } } },
      404: { description: 'Not Found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } }
    }
  }),
  async (c) => {
    const prisma = createPrismaClient(c.env.DB)
    try {
      const archive = await prisma.abemaKeyArchive.findUnique({
        where: { episodeId: c.req.param('episodeId') }
      })
      if (!archive) return c.json({ error: 'No archived key for this episode' }, 404)

      const segments: string[] = JSON.parse(archive.segmentUrls)
      const keyDataUri = `data:application/octet-stream;base64,${hexToBase64(archive.contentKeyHex)}`

      const lines = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        `#EXT-X-TARGETDURATION:${Math.ceil(DEFAULT_SEGMENT_DURATION)}`,
        '#EXT-X-MEDIA-SEQUENCE:0',
        '#EXT-X-PLAYLIST-TYPE:VOD',
        `#EXT-X-KEY:METHOD=AES-128,URI="${keyDataUri}",IV=0x${archive.ivHex}`
      ]
      for (const url of segments) {
        lines.push(`#EXTINF:${DEFAULT_SEGMENT_DURATION.toFixed(3)},`)
        lines.push(`./segment?u=${encodeURIComponent(url)}`)
      }
      lines.push('#EXT-X-ENDLIST', '')

      logger.info({ action: 'serve-m3u8', episodeId: archive.episodeId, segments: segments.length })
      return c.body(lines.join('\n'), 200, {
        'content-type': 'application/vnd.apple.mpegurl',
        'cache-control': 'private, max-age=60'
      })
    } finally {
      await prisma.$disconnect()
    }
  }
)

playback.openapi(
  createRoute({
    method: 'get',
    path: '/abema/:episodeId/segment',
    tags: ['Playback'],
    summary: 'ABEMA CDN の TS セグメントを CORS プロキシして返す',
    request: {
      params: z.object({ episodeId: z.string().nonempty() }),
      query: z.object({ u: z.string().url() })
    },
    responses: {
      200: { description: 'TS segment', content: { 'video/mp2t': { schema: z.string() } } },
      403: { description: 'Forbidden', content: { 'application/json': { schema: z.object({ error: z.string() }) } } },
      404: { description: 'Not Found', content: { 'application/json': { schema: z.object({ error: z.string() }) } } }
    }
  }),
  async (c) => {
    const { u } = c.req.valid('query')
    if (!u.startsWith('https://vod-abematv.akamaized.net/')) {
      return c.json({ error: 'segment host not allowed' }, 403)
    }
    const upstream = await fetch(u)
    if (!upstream.ok) {
      logger.warn({ action: 'segment-upstream-fail', status: upstream.status, url: u })
      return c.json({ error: `upstream ${upstream.status}` }, upstream.status === 404 ? 404 : 403)
    }
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'content-type': upstream.headers.get('content-type') ?? 'video/mp2t',
        'cache-control': 'private, max-age=300',
        'access-control-allow-origin': '*'
      }
    })
  }
)

export default playback
