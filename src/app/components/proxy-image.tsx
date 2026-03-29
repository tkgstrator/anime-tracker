/**
 * R2 に保存された画像を表示するコンポーネント。
 * DB の imageUrl から UUIDv5 でファイル名を生成し、/api/img/ 経由で配信する。
 */
import { imageKey } from '@/lib/image-key'

type ProxyImageProps = {
  src: string
  alt: string
  className?: string
}

export function ProxyImage({ src, alt, className }: ProxyImageProps) {
  return (
    <img
      src={`/api/img/${imageKey(src)}`}
      alt={alt}
      loading='lazy'
      decoding='async'
      draggable={false}
      className={`select-none ${className ?? ''}`}
    />
  )
}
