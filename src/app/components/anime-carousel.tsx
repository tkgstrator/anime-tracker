import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { BadgeCheck } from 'lucide-react'
import { ProviderBadge } from '@/app/components/anime-badges'
import { Badge } from '@/app/components/ui/badge'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/app/components/ui/carousel'
import { getCleanImageUrl } from '@/lib/image'
import type { AnimeSchema } from '@/schemas/anime.dto'

type BadgeType = 'updatedAt' | 'nextEpisodeDate'

type AnimeCarouselProps = {
  title: string
  anime: AnimeSchema[]
  viewAllLink?: string
  badgeType?: BadgeType
}

export function AnimeCarousel({ title, anime, viewAllLink, badgeType }: AnimeCarouselProps) {
  if (anime.length === 0) return null

  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold tracking-tight'>{title}</h2>
        {viewAllLink && (
          <Link to={viewAllLink} className='text-sm text-muted-foreground transition-colors hover:text-foreground'>
            すべて →
          </Link>
        )}
      </div>
      <Carousel opts={{ align: 'start', dragFree: true, loop: true }} className='w-full'>
        <CarouselContent className='-ml-3'>
          {anime.map((item) => (
            <CarouselItem key={item.id} className='basis-[160px] pl-3 sm:basis-[200px]'>
              <CarouselCard anime={item} badgeType={badgeType} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className='-left-4 hidden sm:flex' />
        <CarouselNext className='-right-4 hidden sm:flex' />
      </Carousel>
    </section>
  )
}

function formatDateBadge(date: string, type: BadgeType): string {
  const d = dayjs(date)
  if (type === 'updatedAt') {
    return d.format('M/D H:mm')
  }
  const now = dayjs()
  if (d.isSame(now, 'day')) return `今日 ${d.format('H:mm')}`
  if (d.isSame(now.add(1, 'day'), 'day')) return `明日 ${d.format('H:mm')}`
  return d.format('M/D H:mm')
}

function CarouselCard({ anime, badgeType }: { anime: AnimeSchema; badgeType?: BadgeType }) {
  const badgeDate =
    badgeType === 'updatedAt' ? anime.updatedAt : badgeType === 'nextEpisodeDate' ? anime.nextEpisodeDate : null

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
          <div className='flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground'>
            {anime.title}
          </div>
        )}
        {anime.isIdentified && (
          <BadgeCheck
            className='absolute top-1 right-1 h-5 w-5 fill-blue-500 stroke-white drop-shadow'
            aria-label='AniList 識別済み'
          />
        )}
        {badgeType && badgeDate && (
          <Badge variant='secondary' className='absolute bottom-1 left-1 bg-black/70 text-[10px] text-white'>
            {formatDateBadge(badgeDate, badgeType)}
          </Badge>
        )}
      </div>
      <p className='mt-1.5 truncate text-sm font-medium'>{anime.title}</p>
      <ProviderBadge provider={anime.provider} className='text-[10px]' />
    </Link>
  )
}
