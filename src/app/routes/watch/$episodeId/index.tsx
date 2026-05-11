import { useQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import Hls from 'hls.js'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { episodeQueryOptions } from '@/app/lib/query-options'

export const Route = createFileRoute('/watch/$episodeId/')({
  loader: ({ context: { queryClient }, params }) => queryClient.ensureQueryData(episodeQueryOptions(params.episodeId)),
  pendingComponent: LoadingSpinner,
  component: WatchPage
})

function WatchPage() {
  const { episodeId } = Route.useParams()
  const { data: episode } = useQuery(episodeQueryOptions(episodeId))
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!episode || !episode.hasLocalKey || !videoRef.current) return
    const video = videoRef.current
    const src = `/api/playback/abema/${episodeId}/index.m3u8`

    if (Hls.isSupported()) {
      const hls = new Hls()
      hls.loadSource(src)
      hls.attachMedia(video)
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.fatal) setError(`再生エラー: ${data.type}/${data.details}`)
      })
      return () => hls.destroy()
    }
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src
      return
    }
    setError('このブラウザは HLS 再生に対応していません')
  }, [episode, episodeId])

  if (!episode) return null

  return (
    <div className='space-y-4'>
      <div className='flex items-center gap-3'>
        <Link
          to='/anime/$id'
          params={{ id: episode.anime.id }}
          className='inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        >
          <ArrowLeft className='h-4 w-4' />
          {episode.anime.title} に戻る
        </Link>
      </div>

      <div>
        <h1 className='truncate text-xl font-semibold'>
          <span className='mr-2 text-muted-foreground'>{episode.episodeNumber}.</span>
          {episode.title}
        </h1>
        <p className='mt-0.5 text-sm text-muted-foreground'>
          {episode.season.displayName} ・ {episode.anime.title}
        </p>
      </div>

      {!episode.hasLocalKey ? (
        <div className='rounded-md border border-border bg-muted/30 p-6 text-sm'>
          <p className='font-medium'>このエピソードはローカル再生できません</p>
          <p className='mt-1 text-muted-foreground'>保存済み HLS 鍵が無いため、配信元ページで視聴してください</p>
        </div>
      ) : (
        <div className='overflow-hidden rounded-lg bg-black'>
          <video ref={videoRef} controls playsInline className='aspect-video w-full' aria-label={episode.title}>
            <track kind='captions' />
          </video>
        </div>
      )}

      {error && (
        <div className='rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive'>
          {error}
        </div>
      )}
    </div>
  )
}
