import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { ArrowDownAZ, ArrowUpAZ, Search, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/app/components/ui/pagination'
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
import type { AnimeSchema } from '@/schemas/anime.dto'
import { AnimeCard } from './-components/anime-card'
import { FilterPopover } from './-components/filter-popover'

export const Route = createFileRoute('/')({
  component: AnimeListPage
})

const PAGE_SIZE = 24

function AnimeListPage() {
  const [animeList, setAnimeList] = useState<AnimeSchema[]>([])
  const [loading, setLoading] = useState(true)
  const [filterProvider, setFilterProvider] = useAtom(filterProviderAtom)
  const [filterYear, setFilterYear] = useAtom(filterYearAtom)
  const [filterQuarter, setFilterQuarter] = useAtom(filterQuarterAtom)
  const [filterStatus, setFilterStatus] = useAtom(filterStatusAtom)
  const [sort, setSort] = useAtom(sortAtom)
  const [order, setOrder] = useAtom(orderAtom)
  const [search, setSearch] = useAtom(searchAtom)
  const [page, setPage] = useAtom(pageAtom)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

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
    } finally {
      setLoading(false)
    }
  }, [page, filterProvider, filterYear, filterQuarter, filterStatus, sort, order, search])

  useEffect(() => {
    fetchAnime()
  }, [fetchAnime])

  const years = useMemo(() => {
    const currentYear = dayjs().year()
    return Array.from({ length: 5 }, (_, i) => currentYear - i)
  }, [])

  if (loading) {
    return (
      <div className='flex items-center justify-center py-20'>
        <div className='text-sm text-muted-foreground'>読み込み中...</div>
      </div>
    )
  }

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>アニメ一覧</h1>
        <p className='mt-1 text-sm text-muted-foreground'>{total} 件のアニメを管理中</p>
      </div>

      <div className='relative'>
        <Search className='absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground' />
        <input
          type='text'
          placeholder='タイトル検索...'
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className='h-9 w-full rounded-lg bg-muted pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-indigo-500/30'
        />
      </div>

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
          onSelect={(v) => {
            setFilterProvider(v)
            setPage(1)
          }}
        />
        <FilterPopover
          label='年'
          value={filterYear}
          options={[{ value: undefined, label: 'すべて' }, ...years.map((y) => ({ value: y, label: String(y) }))]}
          onSelect={(v) => {
            setFilterYear(v)
            setPage(1)
          }}
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
          onSelect={(v) => {
            setFilterQuarter(v)
            setPage(1)
          }}
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
          onSelect={(v) => {
            setFilterStatus(v)
            setPage(1)
          }}
        />
        <FilterPopover
          label='並び替え'
          value={sort}
          options={[
            { value: 'title' as const, label: 'タイトル' },
            { value: 'year' as const, label: 'リリース年' }
          ]}
          onSelect={(v) => {
            setSort(v)
            setPage(1)
          }}
        />
        <button
          type='button'
          onClick={() => setOrder(order === 'asc' ? 'desc' : 'asc')}
          className='inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted'
          title={order === 'asc' ? '昇順' : '降順'}
        >
          {order === 'asc' ? <ArrowDownAZ className='h-4 w-4' /> : <ArrowUpAZ className='h-4 w-4' />}
        </button>
        {(filterProvider != null || filterYear != null || filterQuarter != null || filterStatus != null || search) && (
          <button
            type='button'
            onClick={() => {
              setFilterProvider(undefined)
              setFilterYear(undefined)
              setFilterQuarter(undefined)
              setFilterStatus(undefined)
              setSearch('')
              setPage(1)
            }}
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
              onFilterYear={(y) => {
                setFilterYear(y)
                setPage(1)
              }}
              onFilterProvider={(p) => {
                setFilterProvider(p)
                setPage(1)
              }}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination>
          <PaginationContent>
            <PaginationItem>
              <PaginationPrevious
                text='前へ'
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className={page === 1 ? 'pointer-events-none opacity-30' : 'cursor-pointer'}
              />
            </PaginationItem>
            {(() => {
              const pages: (number | 'ellipsis-start' | 'ellipsis-end')[] = []
              if (totalPages <= 7) {
                for (let p = 1; p <= totalPages; p++) pages.push(p)
              } else {
                const hasStartEllipsis = page > 4
                const hasEndEllipsis = page < totalPages - 3
                const middleSlots = 7 - (hasStartEllipsis ? 2 : 1) - (hasEndEllipsis ? 2 : 1)
                const middleStart = hasStartEllipsis
                  ? hasEndEllipsis
                    ? page - Math.floor((middleSlots - 1) / 2)
                    : totalPages - middleSlots
                  : 2
                pages.push(1)
                if (hasStartEllipsis) pages.push('ellipsis-start')
                for (let p = middleStart; p < middleStart + middleSlots; p++) pages.push(p)
                if (hasEndEllipsis) pages.push('ellipsis-end')
                pages.push(totalPages)
              }
              return pages.map((p) =>
                typeof p === 'string' ? (
                  <PaginationItem key={p}>
                    <PaginationEllipsis />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={p}>
                    <PaginationLink isActive={page === p} onClick={() => setPage(p)} className='cursor-pointer'>
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                )
              )
            })()}
            <PaginationItem>
              <PaginationNext
                text='次へ'
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className={page === totalPages ? 'pointer-events-none opacity-30' : 'cursor-pointer'}
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </div>
  )
}
