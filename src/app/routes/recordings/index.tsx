import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback } from 'react'
import { ProviderBadge, StatusBadge } from '@/app/components/anime-badges'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { PageTransition } from '@/app/components/page-transition'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Badge } from '@/app/components/ui/badge'
import { usePaginatedFetch } from '@/app/hooks/use-paginated-fetch'
import api from '@/app/lib/api'
import { getCleanImageUrl } from '@/lib/image'
import { type PaginatedAnimeSchema, QuarterLabel } from '@/schemas/anime.dto'

const PAGE_SIZE = 24

export const Route = createFileRoute('/recordings/')({
  loader: () => api.getAnimeList({ queries: { scheduled: true, page: 1, limit: PAGE_SIZE } }),
  pendingComponent: LoadingSpinner,
  component: RecordingsPage
})

function RecordingsPage() {
  const loaderData = Route.useLoaderData() as PaginatedAnimeSchema

  const fetcher = useCallback(
    (page: number) => api.getAnimeList({ queries: { scheduled: true, page, limit: PAGE_SIZE } }),
    []
  )
  const { data: anime, page, setPage, totalPages, total } = usePaginatedFetch(loaderData, fetcher)

  return (
    <PageTransition>
      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>録画予約一覧</h1>
          <p className='mt-1 text-sm text-muted-foreground'>{total} 件の録画予約タイトル</p>
        </div>

        {anime.length === 0 ? (
          <div className='py-20 text-center'>
            <p className='text-muted-foreground'>録画予約されたタイトルはありません</p>
            <Link to='/' className='mt-2 inline-block text-sm text-blue-500 hover:underline'>
              アニメ一覧から予約する
            </Link>
          </div>
        ) : (
          <div className='divide-y divide-border/50'>
            {anime.map((item) => (
              <Link
                key={item.id}
                to='/anime/$id'
                params={{ id: item.id }}
                className='flex items-center gap-4 py-3 transition-colors hover:bg-muted/30'
              >
                {item.imageUrl && (
                  <img
                    src={getCleanImageUrl(item.imageUrl)}
                    alt={item.title}
                    className='h-16 w-28 shrink-0 rounded object-cover'
                  />
                )}
                <div className='min-w-0 flex-1'>
                  <p className='truncate font-medium'>{item.title}</p>
                  <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                    <ProviderBadge provider={item.provider} />
                    {item.status && item.status !== 'UNKNOWN' && <StatusBadge status={item.status} />}
                    {item.year > 0 && (
                      <span className='text-xs text-muted-foreground'>
                        {item.year}年{item.quarter != null ? ` ${QuarterLabel[item.quarter]}` : ''}
                      </span>
                    )}
                    {item.recorded && (
                      <Badge variant='secondary' className='bg-emerald-500/15 text-emerald-700'>
                        録画済み
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        <SmartPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </PageTransition>
  )
}
