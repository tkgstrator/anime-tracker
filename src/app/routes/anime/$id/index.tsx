import { createFileRoute, Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { Circle, CircleCheck, Clock, ExternalLink, Film, Tv } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'

import { Badge } from '@/app/components/ui/badge'
import api from '@/app/lib/api'
import { providerColor, providerLabel, statusColor, statusLabel } from '@/app/lib/constants'
import { getCleanImageUrl } from '@/lib/image'
import { type AnimeWithSeasonsSchema, QuarterLabel } from '@/schemas/anime.dto'

dayjs.extend(duration)

export const Route = createFileRoute('/anime/$id/')({
  component: AnimeDetailPage
})

function formatDuration(seconds: number): string {
  const d = dayjs.duration(seconds, 'seconds')
  return d.hours() > 0 ? d.format('H:mm:ss') : d.format('m:ss')
}

function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('YYYY/MM/DD')
}

function getWatchUrl(provider: string, episodeId: string): string | null {
  if (!episodeId) return null
  switch (provider) {
    case 'amazon':
      return `https://www.amazon.co.jp/gp/video/detail/${episodeId}`
    case 'hulu':
      return `https://www.hulu.jp/watch/${episodeId}`
    default:
      return null
  }
}

function AnimeDetailPage() {
  const { id } = Route.useParams()
  const [anime, setAnime] = useState<AnimeWithSeasonsSchema | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const toggleScheduled = async () => {
    if (!anime) return
    setUpdating(true)
    try {
      const result = await api.updateAnime({ scheduled: !anime.scheduled }, { params: { id } })
      setAnime((prev) => (prev ? { ...prev, scheduled: result.scheduled } : prev))
    } catch (e) {
      console.error('Failed to update scheduled', e)
    } finally {
      setUpdating(false)
    }
  }

  const toggleRecorded = async () => {
    if (!anime) return
    setUpdating(true)
    try {
      if (!anime.recorded) {
        await api.recordAnime(undefined, { params: { id } })
        toast.success('録画リクエストを送信しました')
      }
      const result = await api.updateAnime({ recorded: !anime.recorded }, { params: { id } })
      setAnime((prev) => (prev ? { ...prev, recorded: result.recorded } : prev))
    } catch (e) {
      console.error('Failed to update recorded', e)
      toast.error('録画リクエストに失敗しました')
    } finally {
      setUpdating(false)
    }
  }

  const fetchAnime = useCallback(async () => {
    try {
      const data = await api.getAnime({ params: { id } })
      setAnime(data)
    } catch {
      setError('アニメが見つかりませんでした')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchAnime()
  }, [fetchAnime])

  if (loading) {
    return (
      <div className='flex items-center justify-center py-20'>
        <div className='text-sm text-muted-foreground'>読み込み中...</div>
      </div>
    )
  }

  if (error || !anime) {
    return (
      <div className='space-y-4 py-20 text-center'>
        <p className='text-muted-foreground'>{error ?? 'Not found'}</p>
        <Link to='/' className='text-sm text-blue-500 hover:underline'>
          一覧に戻る
        </Link>
      </div>
    )
  }

  const totalEpisodes = anime.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  const totalDuration = anime.seasons.reduce((sum, s) => sum + s.episodes.reduce((es, e) => es + e.duration, 0), 0)

  return (
    <div className='space-y-8'>
      <div>
        <Link to='/' className='text-sm text-muted-foreground hover:text-foreground'>
          ← 一覧に戻る
        </Link>
      </div>

      {/* ヒーローセクション */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6'>
        {anime.imageUrl && (
          <div className='-mx-6 shrink-0 overflow-hidden sm:mx-0 sm:w-56 sm:rounded-lg'>
            <img src={getCleanImageUrl(anime.imageUrl)} alt={anime.title} className='w-full object-cover' />
          </div>
        )}
        <div className='min-w-0 space-y-4'>
          <div className='space-y-2'>
            <h1 className='text-xl font-bold tracking-tight sm:text-2xl'>{anime.title}</h1>
            <div className='flex flex-wrap items-center gap-2'>
              <Badge variant='secondary' className={providerColor[anime.provider] ?? ''}>
                {providerLabel[anime.provider] ?? anime.provider}
              </Badge>
              {anime.entityType === 'movie' ? (
                <Badge variant='secondary' className='gap-1'>
                  <Film className='h-3 w-3' />
                  映画
                </Badge>
              ) : (
                <Badge variant='secondary' className='gap-1'>
                  <Tv className='h-3 w-3' />
                  TVシリーズ
                </Badge>
              )}
              {anime.status && (
                <Badge variant='secondary' className={statusColor[anime.status] ?? ''}>
                  {statusLabel[anime.status] ?? anime.status}
                </Badge>
              )}
              {anime.year && (
                <Badge variant='secondary'>
                  {anime.year}年{anime.quarter != null ? ` ${QuarterLabel[anime.quarter]}` : ''}
                </Badge>
              )}
            </div>
          </div>

          <div className='flex items-center gap-2 pt-1'>
            <button
              type='button'
              onClick={toggleScheduled}
              disabled={updating}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                anime.scheduled
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {anime.scheduled ? <CircleCheck className='h-3.5 w-3.5' /> : <Circle className='h-3.5 w-3.5' />}
              {anime.scheduled ? '予約済み' : '録画予約'}
            </button>
            <button
              type='button'
              onClick={toggleRecorded}
              disabled={updating}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                anime.recorded
                  ? 'bg-green-600 text-white hover:bg-green-700'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {anime.recorded ? <CircleCheck className='h-3.5 w-3.5' /> : <Circle className='h-3.5 w-3.5' />}
              {anime.recorded ? '録画済み' : '録画する'}
            </button>
          </div>

          {anime.description && <p className='text-sm leading-relaxed text-muted-foreground'>{anime.description}</p>}

          {/* 統計情報 */}
          {totalEpisodes > 0 && (
            <div className='flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground'>
              <span className='flex items-center gap-1'>
                <Film className='h-3.5 w-3.5' />
                {totalEpisodes} エピソード
              </span>
              <span className='flex items-center gap-1'>
                <Clock className='h-3.5 w-3.5' />
                {formatDuration(totalDuration)}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* シーズン・エピソード一覧 */}
      {anime.seasons.length > 0 && (
        <div className='space-y-8'>
          {anime.seasons.map((season) => (
            <div key={season.id} className='space-y-3'>
              <h2 className='text-lg font-semibold'>{season.displayName}</h2>
              <div className='grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4'>
                {season.episodes.map((episode) => {
                  const watchUrl = getWatchUrl(anime.provider, episode.episodeId)
                  return (
                    <a
                      key={episode.id}
                      href={watchUrl ?? undefined}
                      target={watchUrl ? '_blank' : undefined}
                      rel={watchUrl ? 'noopener noreferrer' : undefined}
                      aria-disabled={!watchUrl}
                      className={`group rounded-lg px-2 py-2 sm:p-0 sm:overflow-hidden ${watchUrl ? 'transition-colors hover:bg-muted/50' : 'pointer-events-none opacity-50'}`}
                    >
                      <img
                        src={getCleanImageUrl(episode.imageUrl)}
                        alt={episode.title}
                        className='hidden aspect-video w-full rounded-t-lg object-cover sm:block'
                      />
                      <div className='flex items-center gap-2 sm:block sm:px-3 sm:py-2'>
                        <div className='min-w-0 flex-1'>
                          <p className='text-sm font-medium sm:truncate'>
                            <span className='text-muted-foreground'>{episode.episodeNumber}.</span> {episode.title}
                          </p>
                          <div className='mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground'>
                            <span>{formatDuration(episode.duration)}</span>
                            {episode.releaseDate && <span>{formatDate(episode.releaseDate)}</span>}
                            {episode.hasSubtitles && <span>字幕</span>}
                            {episode.hasDub && <span>吹替</span>}
                          </div>
                        </div>
                        {watchUrl && <ExternalLink className='h-4 w-4 shrink-0 text-muted-foreground sm:hidden' />}
                      </div>
                    </a>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {anime.seasons.length === 0 && (
        <div className='py-10 text-center'>
          <p className='text-sm text-muted-foreground'>エピソード情報はまだありません</p>
        </div>
      )}
    </div>
  )
}
