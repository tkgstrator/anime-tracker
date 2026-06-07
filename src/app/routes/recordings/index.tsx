import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ProviderBadge, StatusBadge } from '@/app/components/anime-badges'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { ProxyImage } from '@/app/components/proxy-image'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { Checkbox } from '@/app/components/ui/checkbox'
import { Input } from '@/app/components/ui/input'
import api from '@/app/lib/api'
import { queryKeys } from '@/app/lib/query-keys'
import { animeListQueryOptions } from '@/app/lib/query-options'
import { QuarterLabel } from '@/schemas/anime.dto'

const PAGE_SIZE = 24

type RecordedFilter = 'all' | 'recorded' | 'pending'

const RECORDED_OPTIONS: { value: RecordedFilter; label: string }[] = [
  { value: 'all', label: 'すべて' },
  { value: 'pending', label: '未録画' },
  { value: 'recorded', label: '録画済み' }
]

export const Route = createFileRoute('/recordings/')({
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(animeListQueryOptions({ scheduled: true, page: 1, limit: PAGE_SIZE })),
  pendingComponent: LoadingSpinner,
  component: RecordingsPage
})

function RecordingsPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [recordedFilter, setRecordedFilter] = useState<RecordedFilter>('all')
  const [expiringOnly, setExpiringOnly] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const queryFilters = useMemo(() => {
    const recorded = recordedFilter === 'recorded' ? true : recordedFilter === 'pending' ? false : undefined
    return {
      scheduled: true,
      page,
      limit: PAGE_SIZE,
      q: search.trim() || undefined,
      recorded,
      badge: expiringOnly ? 'EXPIRING' : undefined
    }
  }, [page, search, recordedFilter, expiringOnly])

  const { data } = useQuery({
    ...animeListQueryOptions(queryFilters),
    placeholderData: keepPreviousData
  })
  const anime = data?.data ?? []
  const totalPages = data?.totalPages ?? 0
  const total = data?.total ?? 0

  const unscheduleMutation = useMutation({
    mutationFn: (id: string) => api.updateAnime({ scheduled: false }, { params: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anime.all })
    }
  })

  const onUnschedule = async (id: string) => {
    try {
      await unscheduleMutation.mutateAsync(id)
      toast.success('予約を解除しました')
    } catch {
      toast.error('予約解除に失敗しました')
    }
  }

  const bulkUnscheduleMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const results = await Promise.allSettled(
        ids.map((id) => api.updateAnime({ scheduled: false }, { params: { id } }))
      )
      const failed = results.filter((r) => r.status === 'rejected').length
      const succeeded = results.length - failed
      return { succeeded, failed }
    },
    onSuccess: ({ succeeded, failed }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.anime.all })
      setSelected(new Set())
      if (failed === 0) toast.success(`${succeeded} 件の予約を解除しました`)
      else toast.warning(`${succeeded} 件解除、${failed} 件失敗`)
    },
    onError: () => toast.error('一括解除に失敗しました')
  })

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const allSelected = anime.length > 0 && anime.every((item) => prev.has(item.id))
      if (allSelected) {
        const next = new Set(prev)
        for (const item of anime) next.delete(item.id)
        return next
      }
      const next = new Set(prev)
      for (const item of anime) next.add(item.id)
      return next
    })
  }

  const allVisibleSelected = anime.length > 0 && anime.every((item) => selected.has(item.id))
  const selectedCount = selected.size

  const resetFilters = () => {
    setSearch('')
    setRecordedFilter('all')
    setExpiringOnly(false)
    setPage(1)
  }

  const hasActiveFilters = search.trim().length > 0 || recordedFilter !== 'all' || expiringOnly

  return (
    <div className='space-y-5'>
      <div className='flex flex-wrap items-baseline justify-between gap-3'>
        <div>
          <h1 className='text-xl font-bold tracking-tight'>録画予約一覧</h1>
          <p className='mt-0.5 text-xs text-muted-foreground'>
            {total} 件中 {anime.length} 件表示
          </p>
        </div>
        <div className='relative min-w-0 flex-1 sm:max-w-sm'>
          <Search className='pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground' />
          <Input
            type='search'
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder='タイトル検索'
            aria-label='タイトル検索'
            className='h-9 pl-8'
          />
        </div>
      </div>

      <div className='flex flex-wrap items-center gap-2'>
        <div className='inline-flex rounded-md border bg-background p-0.5'>
          {RECORDED_OPTIONS.map((opt) => {
            const active = recordedFilter === opt.value
            return (
              <button
                key={opt.value}
                type='button'
                onClick={() => {
                  setRecordedFilter(opt.value)
                  setPage(1)
                }}
                aria-pressed={active}
                className='inline-flex h-7 items-center rounded px-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-accent-foreground'
              >
                {opt.label}
              </button>
            )
          })}
        </div>
        <Button
          type='button'
          size='sm'
          variant={expiringOnly ? 'default' : 'ghost'}
          onClick={() => {
            setExpiringOnly((v) => !v)
            setPage(1)
          }}
          aria-pressed={expiringOnly}
          className='h-7 text-xs'
        >
          配信終了予定のみ
        </Button>
        {hasActiveFilters && (
          <Button type='button' size='sm' variant='ghost' onClick={resetFilters} className='h-7 text-muted-foreground'>
            <X className='size-3.5' />
            リセット
          </Button>
        )}
      </div>

      {anime.length === 0 ? (
        <div className='py-16 text-center'>
          <p className='text-sm text-muted-foreground'>
            {hasActiveFilters ? '条件に合うタイトルがありません' : '録画予約されたタイトルはありません'}
          </p>
          {hasActiveFilters ? (
            <Button type='button' size='sm' variant='ghost' onClick={resetFilters} className='mt-2'>
              フィルタをリセット
            </Button>
          ) : (
            <Link to='/' className='mt-2 inline-block text-sm text-primary hover:underline'>
              アニメ一覧から予約する
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className='flex flex-wrap items-center justify-between gap-3 border-b pb-2'>
            <label
              htmlFor='select-all-visible'
              className='inline-flex items-center gap-2 text-sm text-muted-foreground'
            >
              <Checkbox
                id='select-all-visible'
                checked={allVisibleSelected}
                onCheckedChange={toggleAllVisible}
                aria-label='表示中をすべて選択'
              />
              表示中をすべて選択
            </label>
            {selectedCount > 0 && (
              <div className='flex items-center gap-2'>
                <span className='text-xs text-muted-foreground'>{selectedCount} 件選択中</span>
                <Button
                  type='button'
                  size='sm'
                  variant='outline'
                  disabled={bulkUnscheduleMutation.isPending}
                  onClick={() => bulkUnscheduleMutation.mutate(Array.from(selected))}
                  className='h-7 text-destructive hover:bg-destructive/10 hover:text-destructive'
                >
                  <X className='size-3.5' />
                  選択分を解除
                </Button>
              </div>
            )}
          </div>

          <ul className='divide-y divide-border/50'>
            {anime.map((item) => {
              const checked = selected.has(item.id)
              return (
                <li key={item.id} className='flex items-center gap-3 py-3 transition-colors hover:bg-muted/30 sm:gap-4'>
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() => toggleSelected(item.id)}
                    aria-label={`${item.title} を選択`}
                    className='shrink-0'
                  />
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
                        className='aspect-video h-16 shrink-0 rounded object-cover'
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
                        {item.badge === 'EXPIRING' && <Badge variant='destructive'>配信終了予定</Badge>}
                      </div>
                    </div>
                  </Link>
                  <Button
                    type='button'
                    size='sm'
                    variant='ghost'
                    onClick={() => onUnschedule(item.id)}
                    disabled={unscheduleMutation.isPending}
                    className='shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive'
                    aria-label={`${item.title} の予約を解除`}
                  >
                    <X />
                    <span className='hidden sm:inline'>解除</span>
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}

      <SmartPagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </div>
  )
}
