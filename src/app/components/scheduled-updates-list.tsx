import { Link } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ChevronRight, Clock } from 'lucide-react'
import { ProviderBadge } from '@/app/components/anime-badges'
import { ProxyImage } from '@/app/components/proxy-image'
import type { AnimeSchema } from '@/schemas/anime.dto'

type ScheduledUpdatesListProps = {
  anime: AnimeSchema[]
}

export function ScheduledUpdatesList({ anime }: ScheduledUpdatesListProps) {
  return (
    <section className='flex h-full flex-col space-y-3'>
      <div className='flex items-center justify-between'>
        <h2 className='text-lg font-semibold tracking-tight'>予約済みの最新更新</h2>
        <Link
          to='/recordings'
          className='inline-flex items-center gap-0.5 text-sm text-muted-foreground transition-colors hover:text-foreground'
        >
          すべて見る
          <ChevronRight className='size-4' />
        </Link>
      </div>
      {anime.length === 0 ? (
        <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed py-10 text-sm text-muted-foreground'>
          予約されたタイトルはまだありません
        </div>
      ) : (
        <ul className='flex-1 divide-y divide-border/50'>
          {anime.map((item) => (
            <li key={item.id}>
              <Link
                to='/anime/$id'
                params={{ id: item.id }}
                className='flex items-center gap-3 py-2.5 transition-colors hover:bg-muted/40'
              >
                {item.imageUrl && (
                  <ProxyImage
                    src={item.imageUrl}
                    alt={item.title}
                    width={160}
                    className='size-12 shrink-0 rounded object-cover'
                  />
                )}
                <div className='min-w-0 flex-1'>
                  <p className='truncate text-sm font-medium'>{item.title}</p>
                  <div className='mt-0.5 flex items-center gap-2 text-xs text-muted-foreground'>
                    <ProviderBadge provider={item.provider} className='text-[10px]' />
                    <span className='inline-flex items-center gap-1'>
                      <Clock className='size-3' />
                      {dayjs(item.updatedAt).format('M/D H:mm')}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
