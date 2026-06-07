import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useSetAtom } from 'jotai'
import { Circle, CircleCheck, Clock, ExternalLink, Film, RefreshCw, Tv } from 'lucide-react'
import { ProviderBadge, StatusBadge } from '@/app/components/anime-badges'
import { ProxyImage } from '@/app/components/proxy-image'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { browseFiltersAtom, defaultBrowseFilters } from '@/app/lib/atoms'
import { providerLabel } from '@/app/lib/constants'
import { type AnimeInfoSchema, QuarterLabel } from '@/schemas/anime.dto'
import { formatDuration, getProviderTitleUrl } from '../-lib/format'

export function AnimeHero({
  anime,
  totalEpisodes,
  totalDuration,
  updating,
  refreshing,
  onToggleScheduled,
  onToggleRecorded,
  onRefresh
}: {
  anime: AnimeInfoSchema
  totalEpisodes: number
  totalDuration: number
  updating: boolean
  refreshing: boolean
  onToggleScheduled: () => void
  onToggleRecorded: () => void
  onRefresh: () => void
}) {
  const setFilters = useSetAtom(browseFiltersAtom)
  const titleUrl = getProviderTitleUrl(anime.provider, anime.contentId)

  return (
    <div className='flex flex-col gap-4 lg:gap-6'>
      {anime.imageUrl && (
        <div className='-mx-6 shrink-0 overflow-hidden sm:mx-0 sm:rounded-lg lg:max-w-md'>
          <ProxyImage src={anime.imageUrl} alt={anime.title} width={600} className='w-full object-cover' />
        </div>
      )}
      <div className='min-w-0 space-y-4'>
        <div className='space-y-2'>
          <h1 className='text-xl font-bold tracking-tight sm:text-2xl'>
            <Link
              to='/browse'
              onClick={() => setFilters({ ...defaultBrowseFilters, aniListId: anime.aniListId })}
              className='transition-colors hover:text-primary'
            >
              {anime.title}
            </Link>
          </h1>
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

        <div className='space-y-1.5'>
          <div className='flex flex-wrap items-center gap-2 pt-1'>
            <Button
              type='button'
              size='lg'
              variant={anime.scheduled ? 'default' : 'secondary'}
              onClick={onToggleScheduled}
              disabled={updating}
              aria-pressed={anime.scheduled}
            >
              {anime.scheduled ? <CircleCheck /> : <Circle />}
              {anime.scheduled ? '自動予約済み' : '自動録画を予約'}
            </Button>
            <Button
              type='button'
              size='lg'
              variant={anime.recorded ? 'default' : 'secondary'}
              onClick={onToggleRecorded}
              disabled={updating}
              aria-pressed={anime.recorded}
              className={
                anime.recorded
                  ? 'bg-success text-success-foreground hover:bg-success/85 [a]:hover:bg-success/85'
                  : undefined
              }
            >
              {anime.recorded ? <CircleCheck /> : <Circle />}
              {anime.recorded ? '録画済み' : '今すぐ録画'}
            </Button>
            {titleUrl && (
              <Button
                size='lg'
                variant='outline'
                render={
                  <a href={titleUrl} target='_blank' rel='noopener noreferrer'>
                    <span>{providerLabel[anime.provider] ?? anime.provider}で見る</span>
                    <ExternalLink data-icon='inline-end' />
                  </a>
                }
              />
            )}
            <Button
              type='button'
              size='lg'
              variant='outline'
              onClick={onRefresh}
              disabled={updating}
              aria-label='タイトル情報を再取得'
              title='タイトル情報を再取得'
            >
              <RefreshCw className={refreshing ? 'animate-spin' : undefined} />
              <span className='hidden sm:inline'>更新</span>
            </Button>
          </div>
          {anime.updatedAt && (
            <p className='text-xs text-muted-foreground'>
              最終更新: {dayjs(anime.updatedAt).format('YYYY/MM/DD HH:mm')}
            </p>
          )}
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
