/**
 * 画像プロキシ経由で外部画像を表示するコンポーネント。
 * DB の imageUrl からID+拡張子を自動抽出し、プロキシURLを構築する。
 */

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const HULU_RE = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|png)/i
const AMAZON_RE = /([0-9a-f]{64})\.(jpg|png)/

type ImageInfo = { id: string; ext: string } | null

function extractImageInfo(imageUrl: string): ImageInfo {
  const huluMatch = imageUrl.match(HULU_RE)
  if (huluMatch) return { id: huluMatch[1], ext: huluMatch[2] }
  const amazonMatch = imageUrl.match(AMAZON_RE)
  if (amazonMatch) return { id: amazonMatch[1], ext: amazonMatch[2] }
  return null
}

function buildProxyUrl(id: string, ext: string, params?: { w?: number; h?: number; q?: number }): string {
  const searchParams = new URLSearchParams()
  if (params?.w) searchParams.set('w', String(params.w))
  if (params?.h) searchParams.set('h', String(params.h))
  if (params?.q) searchParams.set('q', String(params.q))
  const qs = searchParams.toString()
  return `/api/img/${id}.${ext}${qs ? `?${qs}` : ''}`
}

type ProxyImageProps = {
  src: string
  alt: string
  w?: number
  h?: number
  q?: number
  className?: string
}

export function ProxyImage({ src, alt, w, h, q, className }: ProxyImageProps) {
  const info = extractImageInfo(src)
  if (!info) return null

  const isHulu = UUID_RE.test(info.id)
  const retinaW = w ? w * 2 : undefined

  const url = buildProxyUrl(info.id, info.ext, {
    w: retinaW,
    h: isHulu && h ? h * 2 : undefined,
    q: q ?? (isHulu ? 80 : undefined)
  })

  return (
    <img
      src={url}
      alt={alt}
      loading='lazy'
      decoding='async'
      draggable={false}
      className={`select-none ${className ?? ''}`}
    />
  )
}
