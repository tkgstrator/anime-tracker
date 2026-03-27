import { Circle, CircleCheck, Clock, Film, Tv } from 'lucide-react'
import { ProviderBadge, StatusBadge } from '@/app/components/anime-badges'
import { ProxyImage } from '@/app/components/proxy-image'
import { Badge } from '@/app/components/ui/badge'
import { type AnimeInfoSchema, QuarterLabel } from '@/schemas/anime.dto'
import { formatDuration } from '../-lib/format'

export function AnimeHero({
  anime,
  totalEpisodes,
  totalDuration,
  updating,
  onToggleScheduled,
  onToggleRecorded
}: {
  anime: AnimeInfoSchema
  totalEpisodes: number
  totalDuration: number
  updating: boolean
  onToggleScheduled: () => void
  onToggleRecorded: () => void
}) {
  return (
    <div className='flex flex-col gap-4 sm:flex-row sm:items-start sm:gap-6'>
      {anime.imageUrl && (
        <div className='-mx-6 shrink-0 overflow-hidden sm:mx-0 sm:w-56 sm:rounded-lg'>
          <ProxyImage src={anime.imageUrl} alt={anime.title} w={224} className='w-full object-cover' />
        </div>
      )}
      <div className='min-w-0 space-y-4'>
        <div className='space-y-2'>
          <h1 className='text-xl font-bold tracking-tight sm:text-2xl'>{anime.title}</h1>
          <div className='flex flex-wrap items-center gap-2'>
            <ProviderBadge provider={anime.provider} />
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
            {anime.status && <StatusBadge status={anime.status} />}
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
            onClick={onToggleScheduled}
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
            onClick={onToggleRecorded}
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
  )
}
