import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { ArrowDownAZ, ArrowUpAZ, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { PageTransition } from '@/app/components/page-transition'
import { SmartPagination } from '@/app/components/smart-pagination'
import api from '@/app/lib/api'
import {
  filterProviderAtom,
  filterQuarterAtom,
  filterStatusAtom,
  filterYearAtom,
  orderAtom,
  pageAtom,
  searchAtom,
  sortAtom
} from '@/app/lib/atoms'
import type { AnimeSchema, PaginatedAnimeSchema } from '@/schemas/anime.dto'
import { AnimeCard } from './-components/anime-card'
import { FilterPopover } from './-components/filter-popover'
import { SearchBar } from './-components/search-bar'

const PAGE_SIZE = 24

function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw == null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export const Route = createFileRoute('/browse/')({
  loader: () => {
    const page = readStorage('filter-page', 1)
    const provider = readStorage<string | undefined>('filter-provider', undefined)
    const year = readStorage<number | undefined>('filter-year', undefined)
    const quarter = readStorage<number | undefined>('filter-quarter', undefined)
    const status = readStorage<string | undefined>('filter-status', undefined)
    const sort = readStorage<'title' | 'year'>('filter-sort', 'title')
    const order = readStorage<'asc' | 'desc'>('filter-order', 'asc')
    const q = readStorage('filter-search', '')
    return api.getAnimeList({
      queries: { page, limit: PAGE_SIZE, provider, year, quarter, status, sort, order, q: q || undefined }
    })
  },
  pendingComponent: LoadingSpinner,
  component: AnimeListPage
})

function AnimeListPage() {
  const loaderData = Route.useLoaderData() as PaginatedAnimeSchema
  const [animeList, setAnimeList] = useState<AnimeSchema[]>(loaderData.data)
  const [filterProvider, setFilterProvider] = useAtom(filterProviderAtom)
  const [filterYear, setFilterYear] = useAtom(filterYearAtom)
  const [filterQuarter, setFilterQuarter] = useAtom(filterQuarterAtom)
  const [filterStatus, setFilterStatus] = useAtom(filterStatusAtom)
  const [sort, setSort] = useAtom(sortAtom)
  const [order, setOrder] = useAtom(orderAtom)
  const [search, setSearch] = useAtom(searchAtom)
  const [page, setPage] = useAtom(pageAtom)
  const [totalPages, setTotalPages] = useState(loaderData.totalPages)
  const [total, setTotal] = useState(loaderData.total)
  const [initialized, setInitialized] = useState(false)

  const fetchAnime = useCallback(async () => {
    try {
      const res = await api.getAnimeList({
        queries: {
          page,
          limit: PAGE_SIZE,
          provider: filterProvider,
          year: filterYear,
          quarter: filterQuarter,
          status: filterStatus,
          sort,
          order,
          q: search || undefined
        }
      })
      setAnimeList(res.data)
      setTotalPages(res.totalPages)
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to fetch anime list', e)
    }
  }, [page, filterProvider, filterYear, filterQuarter, filterStatus, sort, order, search])

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      return
    }
    fetchAnime()
  }, [fetchAnime, initialized])

  const years = useMemo(() => {
    const currentYear = dayjs().year()
    return Array.from({ length: 5 }, (_, i) => currentYear - i)
  }, [])

  const hasFilters =
    filterProvider != null || filterYear != null || filterQuarter != null || filterStatus != null || search

  const resetFilters = () => {
    setFilterProvider(undefined)
    setFilterYear(undefined)
    setFilterQuarter(undefined)
    setFilterStatus(undefined)
    setSearch('')
    setPage(1)
  }

  const setFilterWithPageReset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setter(v)
      setPage(1)
    }

  return (
    <PageTransition>
      <div className='space-y-6'>
        <div>
          <h1 className='text-2xl font-bold tracking-tight'>アニメ一覧</h1>
          <p className='mt-1 text-sm text-muted-foreground'>{total} 件のアニメを管理中</p>
        </div>

        <SearchBar value={search} onChange={setFilterWithPageReset(setSearch)} />

        <div className='flex flex-wrap items-center gap-2'>
          <FilterPopover
            label='プロバイダ'
            value={filterProvider}
            options={[
              { value: undefined, label: 'すべて' },
              { value: 'amazon', label: 'Prime Video' },
              { value: 'hulu', label: 'Hulu' },
              { value: 'netflix', label: 'Netflix' }
            ]}
            onSelect={setFilterWithPageReset(setFilterProvider)}
          />
          <FilterPopover
            label='年'
            value={filterYear}
            options={[{ value: undefined, label: 'すべて' }, ...years.map((y) => ({ value: y, label: String(y) }))]}
            onSelect={setFilterWithPageReset(setFilterYear)}
          />
          <FilterPopover
            label='シーズン'
            value={filterQuarter}
            options={[
              { value: undefined, label: 'すべて' },
              { value: 0, label: '冬' },
              { value: 1, label: '春' },
              { value: 2, label: '夏' },
              { value: 3, label: '秋' }
            ]}
            onSelect={setFilterWithPageReset(setFilterQuarter)}
          />
          <FilterPopover
            label='ステータス'
            value={filterStatus}
            options={[
              { value: undefined, label: 'すべて' },
              { value: 'RELEASING', label: '放送中' },
              { value: 'FINISHED', label: '完結' },
              { value: 'NOT_YET_RELEASED', label: '未放送' },
              { value: 'CANCELLED', label: '中止' },
              { value: 'HIATUS', label: '休止' }
            ]}
            onSelect={setFilterWithPageReset(setFilterStatus)}
          />
          <FilterPopover
            label='並び替え'
            value={sort}
            options={[
              { value: 'title' as const, label: 'タイトル' },
              { value: 'year' as const, label: 'リリース年' }
            ]}
            onSelect={setFilterWithPageReset(setSort)}
          />
          <button
            type='button'
            onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
            className='inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted'
            title={order === 'asc' ? '昇順' : '降順'}
          >
            {order === 'asc' ? <ArrowDownAZ className='h-4 w-4' /> : <ArrowUpAZ className='h-4 w-4' />}
          </button>
          {hasFilters && (
            <button
              type='button'
              onClick={resetFilters}
              className='inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted'
            >
              <X className='h-3.5 w-3.5' />
              リセット
            </button>
          )}
        </div>

        {animeList.length === 0 ? (
          <div className='py-20 text-center'>
            <p className='text-muted-foreground'>アニメが登録されていません</p>
          </div>
        ) : (
          <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4'>
            {animeList.map((anime) => (
              <AnimeCard
                key={anime.id}
                anime={anime}
                filterYear={filterYear}
                filterProvider={filterProvider}
                filterStatus={filterStatus}
                onFilterYear={setFilterWithPageReset(setFilterYear)}
                onFilterProvider={setFilterWithPageReset(setFilterProvider)}
                onFilterStatus={setFilterWithPageReset(setFilterStatus)}
              />
            ))}
          </div>
        )}

        <SmartPagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </PageTransition>
  )
}
