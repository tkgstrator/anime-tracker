import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { ChevronRight } from 'lucide-react'
import { ProviderBadge } from '@/app/components/anime-badges'
import { animeListQueryOptions } from '@/app/lib/query-options'
import type { AnimeSchema } from '@/schemas/anime.dto'

type RelatedProvidersProps = {
  aniListId: number
  currentAnimeId: string
}

export function RelatedProviders({ aniListId, currentAnimeId }: RelatedProvidersProps) {
  const { data, isLoading } = useQuery({
    ...animeListQueryOptions({ aniListId, limit: 20, sort: 'title', order: 'asc' }),
    enabled: aniListId > 0
  })

  if (aniListId <= 0) return null

  const related = (data?.data ?? []).filter((a: AnimeSchema) => a.id !== currentAnimeId)

  if (isLoading || related.length === 0) return null

  return (
    <section className='space-y-2'>
      <h3 className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>同一作品の他プロバイダ</h3>
      <ul className='divide-y divide-border/60'>
        {related.map((item) => (
          <li key={item.id}>
            <Link
              to='/anime/$id'
              params={{ id: item.id }}
              className='flex items-center justify-between gap-2 py-1.5 transition-colors hover:bg-muted/40'
            >
              <div className='flex min-w-0 items-center gap-2'>
                <ProviderBadge provider={item.provider} className='shrink-0 text-[10px]' />
                <span className='truncate text-xs'>{item.title}</span>
              </div>
              <ChevronRight className='size-3.5 shrink-0 text-muted-foreground' />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
