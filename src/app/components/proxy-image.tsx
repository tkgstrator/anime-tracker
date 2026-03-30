/**
 * 画像プロキシコンポーネント。
 * imageUrl をそのままプロキシ経由で配信する。
 */
// TODO: R2 移行完了後に UUIDv5 ベースに戻す
// import { imageKey } from '@/lib/image-key'

type ProxyImageProps = {
  src: string
  alt: string
  className?: string
}

export function ProxyImage({ src, alt, className }: ProxyImageProps) {
  // TODO: R2 移行完了後に UUIDv5 ベースに戻す
  // const proxySrc = `/api/img/${imageKey(src)}`
  const proxySrc = `/api/img/${btoa(src)}`
  return (
    <img
      src={proxySrc}
      alt={alt}
      loading='lazy'
      decoding='async'
      draggable={false}
      className={`select-none ${className ?? ''}`}
    />
  )
}
