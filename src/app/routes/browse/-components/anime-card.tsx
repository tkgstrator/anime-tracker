import { Film } from 'lucide-react'
import { ProviderBadge, StatusBadge } from '@/app/components/anime-badges'
import { ProxyImage } from '@/app/components/proxy-image'
import { Badge } from '@/app/components/ui/badge'
import type { AnimeSchema } from '@/schemas/anime.dto'

export function AnimeCard({
  anime,
  filterYear,
  filterProvider,
  filterStatus,
  onFilterYear,
  onFilterProvider,
  onFilterStatus,
  onSelect
}: {
  anime: AnimeSchema
  filterYear: number | undefined
  filterProvider: string | undefined
  filterStatus: string | undefined
  onFilterYear: (year: number | undefined) => void
  onFilterProvider: (provider: string | undefined) => void
  onFilterStatus: (status: string | undefined) => void
  onSelect: (animeId: string) => void
}) {
  return (
    <button
      type='button'
      onClick={() => onSelect(anime.id)}
      className='group block text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background'
    >
      <div className='relative aspect-video w-full overflow-hidden rounded-lg bg-muted'>
        {anime.imageUrl ? (
          <ProxyImage
            src={anime.imageUrl}
            alt={anime.title}
            width={480}
            className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
          />
        ) : (
          <div className='flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground'>
            <Film className='size-6 opacity-60' aria-hidden='true' />
            <span className='line-clamp-2 w-full break-all'>{anime.title}</span>
          </div>
        )}
      </div>
      <p className='mt-1.5 truncate text-sm font-medium'>{anime.title}</p>
      <div className='flex items-center gap-1.5'>
        {anime.year && (
          <Badge
            variant='secondary'
            className='cursor-pointer text-[10px]'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFilterYear(filterYear === anime.year ? undefined : anime.year)
            }}
          >
            {anime.year}
          </Badge>
        )}
        {anime.status && (
          <StatusBadge
            status={anime.status}
            className='cursor-pointer text-[10px]'
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onFilterStatus(filterStatus === anime.status ? undefined : anime.status)
            }}
          />
        )}
        <ProviderBadge
          provider={anime.provider}
          className='cursor-pointer text-[10px]'
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            onFilterProvider(filterProvider === anime.provider ? undefined : anime.provider)
          }}
        />
      </div>
    </button>
  )
}
