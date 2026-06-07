import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { z } from 'zod'
import { AnimeDrawer } from '@/app/components/anime-drawer'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { type BrowseFilters, browseFiltersAtom, defaultBrowseFilters } from '@/app/lib/atoms'
import { providerLabel } from '@/app/lib/constants'
import { animeListQueryOptions } from '@/app/lib/query-options'
import { ProviderTypeEnum } from '@/schemas/message.dto'
import { AnimeCard } from './-components/anime-card'
import { FilterSidebar } from './-components/filter-sidebar'
import { SearchBar } from './-components/search-bar'

const PAGE_SIZE = 24

const QUARTER_LABEL = ['冬', '春', '夏', '秋'] as const

const STATUS_LABEL: Record<string, string> = {
  RELEASING: '放送中',
  FINISHED: '完結',
  NOT_YET_RELEASED: '未放送',
  CANCELLED: '中止',
  HIATUS: '休止'
}

const BADGE_LABEL: Record<string, string> = {
  NEW_EPISODE: '新着エピソード',
  RECENTLY_ADDED: '新着追加',
  COMING_SOON: '配信予定',
  EXPIRING: '配信終了予定'
}

const SORT_OPTIONS = [
  { value: 'title-asc', label: 'タイトル ↑', sort: 'title' as const, order: 'asc' as const },
  { value: 'title-desc', label: 'タイトル ↓', sort: 'title' as const, order: 'desc' as const },
  { value: 'year-asc', label: 'リリース年 ↑', sort: 'year' as const, order: 'asc' as const },
  { value: 'year-desc', label: 'リリース年 ↓', sort: 'year' as const, order: 'desc' as const }
] as const

type SortValue = (typeof SORT_OPTIONS)[number]['value']

export const Route = createFileRoute('/browse/')({
  validateSearch: z.object({
    provider: ProviderTypeEnum.optional(),
    badge: z.string().optional(),
    q: z.string().optional()
  }),
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(animeListQueryOptions({ page: 1, limit: PAGE_SIZE, sort: 'title', order: 'asc' })),
  pendingComponent: LoadingSpinner,
  component: AnimeListPage
})

function AnimeListPage() {
  const { provider: searchProvider, badge: searchBadge, q: searchQuery } = Route.useSearch()
  const [filters, setFilters] = useAtom(browseFiltersAtom)
  const [drawerId, setDrawerId] = useState<string | null>(null)

  useEffect(() => {
    if (searchQuery === undefined) return
    if (filters.search === searchQuery) return
    setFilters((prev) => ({ ...prev, search: searchQuery, page: 1 }))
  }, [searchQuery, filters.search, setFilters])

  const provider = searchProvider !== undefined ? searchProvider : filters.provider
  const badge = searchBadge !== undefined ? searchBadge : filters.badge

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
      badge,
      aniListId: filters.aniListId,
      sort: filters.sort,
      order: filters.order,
      q: filters.search || undefined
    }),
    [filters, provider, badge]
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

  const sortValue: SortValue = `${filters.sort}-${filters.order}` as SortValue
  const onSortChange = (next: string) => {
    const opt = SORT_OPTIONS.find((o) => o.value === next)
    if (!opt) return
    setFilters((prev) => ({ ...prev, sort: opt.sort, order: opt.order, page: 1 }))
  }

  const activeChips = [
    provider != null && {
      key: 'provider',
      label: `配信元: ${providerLabel[provider] ? providerLabel[provider] : provider}`,
      onClear: () => setFilter('provider')(undefined)
    },
    filters.year != null && {
      key: 'year',
      label: `${filters.year}年`,
      onClear: () => setFilter('year')(undefined)
    },
    filters.quarter != null && {
      key: 'quarter',
      label: QUARTER_LABEL[filters.quarter] ? QUARTER_LABEL[filters.quarter] : '',
      onClear: () => setFilter('quarter')(undefined)
    },
    filters.status != null && {
      key: 'status',
      label: STATUS_LABEL[filters.status] ? STATUS_LABEL[filters.status] : filters.status,
      onClear: () => setFilter('status')(undefined)
    },
    badge != null && {
      key: 'badge',
      label: BADGE_LABEL[badge] ? BADGE_LABEL[badge] : badge,
      onClear: () => setFilter('badge')(undefined)
    },
    filters.aniListId != null && {
      key: 'aniListId',
      label: `関連シリーズ: ${filters.aniListId}`,
      onClear: () => setFilter('aniListId')(undefined)
    },
    filters.search && {
      key: 'search',
      label: `検索: ${filters.search}`,
      onClear: () => setFilter('search')('')
    }
  ].filter((v): v is { key: string; label: string; onClear: () => void } => Boolean(v))

  const hasFilters = activeChips.length > 0

  const resetFilters = () => {
    setFilters({ ...defaultBrowseFilters })
  }

  return (
    <div className='grid gap-6 lg:grid-cols-[16rem_1fr] xl:grid-cols-[18rem_1fr]'>
      <FilterSidebar
        provider={provider}
        year={filters.year}
        quarter={filters.quarter}
        status={filters.status}
        badge={badge}
        sortValue={sortValue}
        years={years}
        hasFilters={hasFilters}
        sortOptions={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
        onChangeProvider={setFilter('provider')}
        onChangeYear={setFilter('year')}
        onChangeQuarter={setFilter('quarter')}
        onChangeStatus={setFilter('status')}
        onChangeBadge={setFilter('badge')}
        onChangeSort={onSortChange}
        onReset={resetFilters}
      />

      <div className='space-y-4'>
        <div className='flex flex-wrap items-baseline justify-between gap-3'>
          <div>
            <h1 className='text-xl font-bold tracking-tight'>アニメ一覧</h1>
            <p className='mt-0.5 text-xs text-muted-foreground'>{total} 件のアニメを管理中</p>
          </div>
          <div className='min-w-0 flex-1 sm:max-w-sm'>
            <SearchBar value={filters.search} onChange={setFilter('search')} />
          </div>
        </div>

        {hasFilters && (
          <div className='flex flex-wrap items-center gap-1.5'>
            <span className='text-xs text-muted-foreground'>適用中:</span>
            {activeChips.map((chip) => (
              <Badge key={chip.key} variant='secondary' className='gap-1 py-0.5 pr-1'>
                {chip.label}
                <button
                  type='button'
                  onClick={chip.onClear}
                  aria-label={`${chip.label} を解除`}
                  className='inline-flex size-4 items-center justify-center rounded-sm hover:bg-foreground/10'
                >
                  <X className='size-3' />
                </button>
              </Badge>
            ))}
          </div>
        )}

        {animeList.length === 0 ? (
          <div className='py-20 text-center'>
            <p className='text-muted-foreground'>条件に合うアニメが見つかりません</p>
            {hasFilters && (
              <Button type='button' size='sm' variant='ghost' onClick={resetFilters} className='mt-3'>
                フィルタをリセット
              </Button>
            )}
          </div>
        ) : (
          <div className='grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6'>
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
                onSelect={setDrawerId}
              />
            ))}
          </div>
        )}

        <SmartPagination page={filters.page} totalPages={totalPages} onPageChange={setFilter('page')} />
      </div>

      <AnimeDrawer
        animeId={drawerId}
        open={drawerId !== null}
        onOpenChange={(next) => {
          if (!next) setDrawerId(null)
        }}
      />
    </div>
  )
}
