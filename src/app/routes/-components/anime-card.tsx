import { Link } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import { Badge } from '@/app/components/ui/badge'
import { providerColor, providerLabel, statusColor, statusLabel } from '@/app/lib/constants'
import { getCleanImageUrl } from '@/lib/image'
import type { AnimeSchema } from '@/schemas/anime.dto'

export function AnimeCard({
  anime,
  filterYear,
  filterProvider,
  onFilterYear,
  onFilterProvider
}: {
  anime: AnimeSchema
  filterYear: number | undefined
  filterProvider: string | undefined
  onFilterYear: (year: number | undefined) => void
  onFilterProvider: (provider: string | undefined) => void
}) {
  return (
    <Link to='/anime/$id' params={{ id: anime.id }} className='group block'>
      <div className='relative aspect-video w-full overflow-hidden rounded-lg bg-muted'>
        {anime.imageUrl ? (
          <img
            src={getCleanImageUrl(anime.imageUrl)}
            alt={anime.title}
            className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
          />
        ) : (
          <div className='flex h-full items-center justify-center p-4 text-center text-sm text-muted-foreground'>
            {anime.title}
          </div>
        )}
        {anime.isIdentified && (
          <BadgeCheck
            className='absolute top-1.5 right-1.5 h-6 w-6 fill-blue-500 stroke-white drop-shadow'
            aria-label='AniList 識別済み'
          />
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
              onFilterYear(filterYear === anime.year ? undefined : (anime.year ?? undefined))
            }}
          >
            {anime.year}
          </Badge>
        )}
        {anime.status && (
          <Badge variant='secondary' className={`text-[10px] ${statusColor[anime.status] ?? ''}`}>
            {statusLabel[anime.status] ?? anime.status}
          </Badge>
        )}
        <Badge
          variant='secondary'
          className={`cursor-pointer text-[10px] ${providerColor[anime.provider] ?? ''}`}
          onClick={(e) => {
            e.preventDefault()
            onFilterProvider(filterProvider === anime.provider ? undefined : anime.provider)
          }}
        >
          {providerLabel[anime.provider] ?? anime.provider}
        </Badge>
      </div>
    </Link>
  )
}
