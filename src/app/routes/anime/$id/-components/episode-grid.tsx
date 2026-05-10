import { ExternalLink } from 'lucide-react'
import { useState } from 'react'
import { ProxyImage } from '@/app/components/proxy-image'
import type { AnimeInfoSchema } from '@/schemas/anime.dto'
import { formatDate, formatDuration, getWatchUrl } from '../-lib/format'

type Season = AnimeInfoSchema['seasons'][number]

export function EpisodeGrid({ seasons, provider }: { seasons: Season[]; provider: string }) {
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(seasons[0]?.id ?? null)

  if (seasons.length === 0) {
    return (
      <div className='py-10 text-center'>
        <p className='text-sm text-muted-foreground'>エピソード情報はまだありません</p>
      </div>
    )
  }

  if (seasons.length === 1) {
    const season = seasons[0]
    return (
      <section className='space-y-3'>
        <h2 className='text-lg font-semibold'>{season.displayName}</h2>
        <EpisodeList season={season} provider={provider} />
      </section>
    )
  }

  const active = seasons.find((s) => s.id === activeSeasonId) ?? seasons[0]

  return (
    <section className='space-y-4'>
      <div role='tablist' className='flex flex-wrap gap-1 border-b border-border'>
        {seasons.map((season) => {
          const isActive = season.id === active.id
          return (
            <button
              key={season.id}
              type='button'
              role='tab'
              aria-selected={isActive}
              onClick={() => setActiveSeasonId(season.id)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors ${
                isActive
                  ? 'border-primary font-medium text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {season.displayName}
              <span className='ml-1 text-xs text-muted-foreground'>({season.episodes.length})</span>
            </button>
          )
        })}
      </div>
      <EpisodeList season={active} provider={provider} />
    </section>
  )
}

function EpisodeList({ season, provider }: { season: Season; provider: string }) {
  return (
    <div className='grid grid-cols-1 gap-1 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3 xl:grid-cols-4'>
      {season.episodes.map((episode) => {
        const watchUrl = getWatchUrl(provider, episode.episodeId)
        return (
          <a
            key={episode.id}
            href={watchUrl ?? undefined}
            target={watchUrl ? '_blank' : undefined}
            rel={watchUrl ? 'noopener noreferrer' : undefined}
            aria-disabled={!watchUrl}
            title={watchUrl ? `${providerName(provider)}で視聴` : '配信元 URL がありません'}
            className={`group rounded-lg px-2 py-2 sm:overflow-hidden sm:p-0 ${watchUrl ? 'transition-colors hover:bg-muted/50' : 'pointer-events-none opacity-50'}`}
          >
            <ProxyImage
              src={episode.imageUrl}
              alt={episode.title}
              width={480}
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
  )
}

function providerName(provider: string): string {
  switch (provider) {
    case 'amazon':
      return 'Prime Video'
    case 'hulu':
      return 'Hulu'
    case 'crunchyroll':
      return 'Crunchyroll'
    case 'abema':
      return 'ABEMA'
    case 'netflix':
      return 'Netflix'
    default:
      return provider
  }
}
