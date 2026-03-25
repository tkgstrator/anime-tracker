import { Link } from '@tanstack/react-router'
import { BadgeCheck } from 'lucide-react'
import { ProviderBadge } from '@/app/components/anime-badges'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/app/components/ui/carousel'
import { getCleanImageUrl } from '@/lib/image'
import type { AnimeSchema } from '@/schemas/anime.dto'

type AnimeCarouselProps = {
  title: string
  anime: AnimeSchema[]
  viewAllLink?: string
}

export function AnimeCarousel({ title, anime, viewAllLink }: AnimeCarouselProps) {
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
              <CarouselCard anime={item} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className='-left-4 hidden sm:flex' />
        <CarouselNext className='-right-4 hidden sm:flex' />
      </Carousel>
    </section>
  )
}

function CarouselCard({ anime }: { anime: AnimeSchema }) {
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
      </div>
      <p className='mt-1.5 truncate text-sm font-medium'>{anime.title}</p>
      <ProviderBadge provider={anime.provider} className='text-[10px]' />
    </Link>
  )
}
