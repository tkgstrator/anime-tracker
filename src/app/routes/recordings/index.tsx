import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { X } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ProviderBadge, StatusBadge } from '@/app/components/anime-badges'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { ProxyImage } from '@/app/components/proxy-image'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import api from '@/app/lib/api'
import { queryKeys } from '@/app/lib/query-keys'
import { animeListQueryOptions } from '@/app/lib/query-options'
import { QuarterLabel } from '@/schemas/anime.dto'

const PAGE_SIZE = 24

export const Route = createFileRoute('/recordings/')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(animeListQueryOptions({ scheduled: true, page: 1, limit: PAGE_SIZE })),
  pendingComponent: LoadingSpinner,
  component: RecordingsPage
})

function RecordingsPage() {
  const [page, setPage] = useState(1)
  const queryClient = useQueryClient()
  const { data } = useQuery({
    ...animeListQueryOptions({ scheduled: true, page, limit: PAGE_SIZE }),
    placeholderData: keepPreviousData
  })
  const anime = data?.data ?? []
  const totalPages = data?.totalPages ?? 0
  const total = data?.total ?? 0

  const unscheduleMutation = useMutation({
    mutationFn: (id: string) => api.updateAnime({ scheduled: false }, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anime.all })
      toast.success('予約を解除しました')
    },
    onError: () => toast.error('予約解除に失敗しました')
  })

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>録画予約一覧</h1>
        <p className='mt-1 text-sm text-muted-foreground'>{total} 件の録画予約タイトル</p>
      </div>

      {anime.length === 0 ? (
        <div className='py-20 text-center'>
          <p className='text-muted-foreground'>録画予約されたタイトルはありません</p>
          <Link to='/' className='mt-2 inline-block text-sm text-primary hover:underline'>
            アニメ一覧から予約する
          </Link>
        </div>
      ) : (
        <div className='divide-y divide-border/50'>
          {anime.map((item) => (
            <div key={item.id} className='flex items-center gap-3 py-3 transition-colors hover:bg-muted/30 sm:gap-4'>
              <Link
                to='/anime/$id'
                params={{ id: item.id }}
                className='flex min-w-0 flex-1 items-center gap-3 sm:gap-4'
              >
                {item.imageUrl && (
                  <ProxyImage
                    src={item.imageUrl}
                    alt={item.title}
                    width={240}
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
                      <Badge variant='secondary' className='bg-success/15 text-success'>
                        録画済み
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
              <Button
                type='button'
                size='sm'
                variant='ghost'
                onClick={() => unscheduleMutation.mutate(item.id)}
                disabled={unscheduleMutation.isPending}
                className='shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                aria-label={`${item.title} の予約を解除`}
              >
                <X />
                <span className='hidden sm:inline'>解除</span>
              </Button>
            </div>
          ))}
        </div>
      )}

      <SmartPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
