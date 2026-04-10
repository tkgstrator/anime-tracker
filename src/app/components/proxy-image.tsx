/** Image proxy component. Serves imageUrl via the proxy endpoint. */

type ProxyImageProps = {
  src: string
  alt: string
  className?: string
  width?: number
}

export function ProxyImage({ src, alt, className, width }: ProxyImageProps) {
  const base = `/api/img/${btoa(src).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  const proxySrc = width !== undefined ? `${base}?w=${width}` : base
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
