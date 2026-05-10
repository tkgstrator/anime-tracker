import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ProviderBadge } from '@/app/components/anime-badges'
import { ProxyImage } from '@/app/components/proxy-image'
import { Badge } from '@/app/components/ui/badge'
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from '@/app/components/ui/carousel'
import type { AnimeSchema } from '@/schemas/anime.dto'

type BadgeType = 'updatedAt' | 'nextEpisodeDate' | 'expiredAt'

type AnimeCarouselProps = {
  title: string
  anime: AnimeSchema[]
  viewAllLink?: string
  badgeType?: BadgeType
  showProvider?: boolean
}

export function AnimeCarousel({ title, anime, viewAllLink, badgeType, showProvider = true }: AnimeCarouselProps) {
  if (anime.length === 0) return null

  return (
    <section className='space-y-3'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold tracking-tight'>{title}</h2>
        {viewAllLink && (
          <Link to={viewAllLink} className='text-sm text-muted-foreground transition-colors hover:text-foreground'>
            すべて見る
          </Link>
        )}
      </div>
      <Carousel opts={{ align: 'start', dragFree: true, loop: true }} className='w-full'>
        <CarouselContent className='-ml-3'>
          {anime.map((item) => (
            <CarouselItem key={item.id} className='basis-[160px] pl-3 sm:basis-[200px]'>
              <CarouselCard anime={item} badgeType={badgeType} showProvider={showProvider} />
            </CarouselItem>
          ))}
        </CarouselContent>
        <CarouselPrevious className='-left-4 hidden sm:flex' />
        <CarouselNext className='-right-4 hidden sm:flex' />
      </Carousel>
    </section>
  )
}

function roundTo10Min(d: dayjs.Dayjs): dayjs.Dayjs {
  return d.minute(Math.floor(d.minute() / 10) * 10).second(0)
}

function formatDateBadge(date: string, type: BadgeType): string {
  const d = roundTo10Min(dayjs(date))
  if (type === 'updatedAt') {
    return d.format('M/D H:mm')
  }
  if (type === 'expiredAt') {
    return `${d.format('M/D')}まで`
  }
  const now = dayjs()
  if (d.isSame(now, 'day')) return `今日 ${d.format('H:mm')}`
  if (d.isSame(now.add(1, 'day'), 'day')) return `明日 ${d.format('H:mm')}`
  return d.format('M/D H:mm')
}

function CarouselCard({
  anime,
  badgeType,
  showProvider
}: {
  anime: AnimeSchema
  badgeType?: BadgeType
  showProvider: boolean
}) {
  const badgeDate =
    badgeType === 'updatedAt'
      ? anime.updatedAt
      : badgeType === 'nextEpisodeDate'
        ? anime.nextEpisodeDate
        : badgeType === 'expiredAt'
          ? anime.expiredAt
          : null

  return (
    <Link to='/anime/$id' params={{ id: anime.id }} className='group block'>
      <div className='relative aspect-video w-full overflow-hidden rounded-lg bg-muted'>
        {anime.imageUrl ? (
          <ProxyImage
            src={anime.imageUrl}
            alt={anime.title}
            width={400}
            className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
          />
        ) : (
          <div className='flex h-full items-center justify-center p-2 text-center text-xs text-muted-foreground'>
            {anime.title}
          </div>
        )}
        {badgeType && badgeDate && (
          <Badge
            variant='secondary'
            className='absolute bottom-1 left-1 bg-overlay text-[10px] text-overlay-foreground'
          >
            {formatDateBadge(badgeDate, badgeType)}
          </Badge>
        )}
      </div>
      <p className='mt-1.5 truncate text-sm font-medium'>{anime.title}</p>
      {showProvider && <ProviderBadge provider={anime.provider} className='text-[10px]' />}
    </Link>
  )
}
