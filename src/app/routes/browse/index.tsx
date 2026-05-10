import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { ArrowDownAZ, ArrowUpAZ, X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { z } from 'zod'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Button } from '@/app/components/ui/button'
import { type BrowseFilters, browseFiltersAtom, defaultBrowseFilters } from '@/app/lib/atoms'
import { animeListQueryOptions } from '@/app/lib/query-options'
import { ProviderTypeEnum } from '@/schemas/message.dto'
import { AnimeCard } from './-components/anime-card'
import { FilterPopover } from './-components/filter-popover'
import { SearchBar } from './-components/search-bar'

const PAGE_SIZE = 24

export const Route = createFileRoute('/browse/')({
  validateSearch: z.object({
    provider: ProviderTypeEnum.optional()
  }),
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(animeListQueryOptions({ page: 1, limit: PAGE_SIZE, sort: 'title', order: 'asc' })),
  pendingComponent: LoadingSpinner,
  component: AnimeListPage
})

function AnimeListPage() {
  const { provider: searchProvider } = Route.useSearch()
  const [filters, setFilters] = useAtom(browseFiltersAtom)

  const provider = searchProvider ?? filters.provider

  const setFilter = useCallback(
    <K extends keyof BrowseFilters>(key: K) =>
      (value: BrowseFilters[K]) => {
        setFilters((prev) => ({ ...prev, [key]: value, page: key === 'page' ? (value as number) : 1 }))
      },
    [setFilters]
  )

  const queryFilters = useMemo(
    () => ({
      page: filters.page,
      limit: PAGE_SIZE,
      provider,
      year: filters.year,
      quarter: filters.quarter,
      status: filters.status,
      badge: filters.badge,
      aniListId: filters.aniListId,
      exclusive: filters.exclusive,
      sort: filters.sort,
      order: filters.order,
      q: filters.search || undefined
    }),
    [filters, provider]
  )

  const { data } = useQuery({
    ...animeListQueryOptions(queryFilters),
    placeholderData: keepPreviousData
  })
  const animeList = data?.data ?? []
  const totalPages = data?.totalPages ?? 0
  const total = data?.total ?? 0

  const years = useMemo(() => {
    const currentYear = dayjs().year()
    return Array.from({ length: 5 }, (_, i) => currentYear - i)
  }, [])

  const hasFilters =
    provider != null ||
    filters.year != null ||
    filters.quarter != null ||
    filters.status != null ||
    filters.badge != null ||
    filters.aniListId != null ||
    filters.exclusive != null ||
    filters.search

  const resetFilters = () => {
    setFilters({ ...defaultBrowseFilters })
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>アニメ一覧</h1>
        <p className='mt-1 text-sm text-muted-foreground'>{total} 件のアニメを管理中</p>
      </div>

      <SearchBar value={filters.search} onChange={setFilter('search')} />

      <div className='flex flex-wrap items-center gap-2'>
        <FilterPopover
          label='プロバイダ'
          value={provider}
          options={[
            { value: undefined, label: 'すべて' },
            { value: 'amazon', label: 'Prime Video' },
            { value: 'hulu', label: 'Hulu' },
            { value: 'crunchyroll', label: 'Crunchyroll' },
            { value: 'abema', label: 'ABEMA' },
            { value: 'netflix', label: 'Netflix' }
          ]}
          onSelect={setFilter('provider')}
        />
        <FilterPopover
          label='年'
          value={filters.year}
          options={[{ value: undefined, label: 'すべて' }, ...years.map((y) => ({ value: y, label: String(y) }))]}
          onSelect={setFilter('year')}
        />
        <FilterPopover
          label='シーズン'
          value={filters.quarter}
          options={[
            { value: undefined, label: 'すべて' },
            { value: 0, label: '冬' },
            { value: 1, label: '春' },
            { value: 2, label: '夏' },
            { value: 3, label: '秋' }
          ]}
          onSelect={setFilter('quarter')}
        />
        <FilterPopover
          label='ステータス'
          value={filters.status}
          options={[
            { value: undefined, label: 'すべて' },
            { value: 'RELEASING', label: '放送中' },
            { value: 'FINISHED', label: '完結' },
            { value: 'NOT_YET_RELEASED', label: '未放送' },
            { value: 'CANCELLED', label: '中止' },
            { value: 'HIATUS', label: '休止' }
          ]}
          onSelect={setFilter('status')}
        />
        <FilterPopover
          label='バッジ'
          value={filters.badge}
          options={[
            { value: undefined, label: 'すべて' },
            { value: 'NEW_EPISODE', label: '新着エピソード' },
            { value: 'RECENTLY_ADDED', label: '新着追加' },
            { value: 'COMING_SOON', label: '配信予定' },
            { value: 'EXPIRING', label: '配信終了予定' }
          ]}
          onSelect={setFilter('badge')}
        />
        <FilterPopover
          label='独占配信'
          value={filters.exclusive}
          options={[
            { value: undefined, label: 'すべて' },
            { value: true, label: '独占配信のみ' },
            { value: false, label: '複数プロバイダ' }
          ]}
          onSelect={setFilter('exclusive')}
        />
        <FilterPopover
          label='並び替え'
          value={filters.sort}
          options={[
            { value: 'title' as const, label: 'タイトル' },
            { value: 'year' as const, label: 'リリース年' }
          ]}
          onSelect={setFilter('sort')}
        />
        <Button
          type='button'
          size='lg'
          variant='ghost'
          onClick={() => setFilters((prev) => ({ ...prev, order: prev.order === 'asc' ? 'desc' : 'asc' }))}
          aria-label={filters.order === 'asc' ? '昇順' : '降順'}
          title={filters.order === 'asc' ? '昇順' : '降順'}
          className='text-muted-foreground'
        >
          {filters.order === 'asc' ? <ArrowDownAZ /> : <ArrowUpAZ />}
        </Button>
        {hasFilters && (
          <Button type='button' size='lg' variant='ghost' onClick={resetFilters} className='text-muted-foreground'>
            <X />
            リセット
          </Button>
        )}
      </div>

      {animeList.length === 0 ? (
        <div className='py-20 text-center'>
          <p className='text-muted-foreground'>アニメが登録されていません</p>
        </div>
      ) : (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
          {animeList.map((anime) => (
            <AnimeCard
              key={anime.id}
              anime={anime}
              filterYear={filters.year}
              filterProvider={provider}
              filterStatus={filters.status}
              onFilterYear={setFilter('year')}
              onFilterProvider={setFilter('provider')}
              onFilterStatus={setFilter('status')}
            />
          ))}
        </div>
      )}

      <SmartPagination page={filters.page} totalPages={totalPages} onPageChange={setFilter('page')} />
    </div>
  )
}
