/** Image proxy component. Serves imageUrl via the proxy endpoint. */
import { useState } from 'react'

type ProxyImageProps = {
  src: string
  alt: string
  className?: string
  width?: number
}

export function ProxyImage({ src, alt, className, width }: ProxyImageProps) {
  const [failed, setFailed] = useState(false)

  if (failed) {
    const firstChar = Array.from(alt.trim())[0]
    const initial = firstChar !== undefined ? firstChar : '?'
    return (
      <div
        role='img'
        aria-label={alt}
        className={`flex select-none items-center justify-center overflow-hidden bg-muted text-muted-foreground ${className ?? ''}`}
      >
        <span aria-hidden='true' className='text-2xl font-semibold leading-none'>
          {initial}
        </span>
      </div>
    )
  }

  const base = `/api/img/${btoa(src).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`
  const proxySrc = width !== undefined ? `${base}?w=${width}` : base
  return (
    <img
      src={proxySrc}
      alt={alt}
      loading='lazy'
      decoding='async'
      draggable={false}
      onError={() => setFailed(true)}
      className={`select-none ${className ?? ''}`}
    />
  )
}
