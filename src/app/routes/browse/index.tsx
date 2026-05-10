import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useAtom } from 'jotai'
import { X } from 'lucide-react'
import { useCallback, useMemo } from 'react'
import { z } from 'zod'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Badge } from '@/app/components/ui/badge'
import { Button } from '@/app/components/ui/button'
import { type BrowseFilters, browseFiltersAtom, defaultBrowseFilters } from '@/app/lib/atoms'
import { providerLabel } from '@/app/lib/constants'
import { animeListQueryOptions } from '@/app/lib/query-options'
import { ProviderTypeEnum } from '@/schemas/message.dto'
import { AnimeCard } from './-components/anime-card'
import { FilterPopover } from './-components/filter-popover'
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
    badge: z.string().optional()
  }),
  loader: ({ context: { queryClient } }) =>
    queryClient.ensureQueryData(animeListQueryOptions({ page: 1, limit: PAGE_SIZE, sort: 'title', order: 'asc' })),
  pendingComponent: LoadingSpinner,
  component: AnimeListPage
})

function AnimeListPage() {
  const { provider: searchProvider, badge: searchBadge } = Route.useSearch()
  const [filters, setFilters] = useAtom(browseFiltersAtom)

  const provider = searchProvider ?? filters.provider
  const badge = searchBadge ?? filters.badge

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
      exclusive: filters.exclusive,
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
  const onSortChange = (next: SortValue | undefined) => {
    if (!next) return
    const opt = SORT_OPTIONS.find((o) => o.value === next)
    if (!opt) return
    setFilters((prev) => ({ ...prev, sort: opt.sort, order: opt.order, page: 1 }))
  }

  const activeChips = [
    provider != null && {
      key: 'provider',
      label: `配信元: ${providerLabel[provider] ?? provider}`,
      onClear: () => setFilter('provider')(undefined)
    },
    filters.year != null && {
      key: 'year',
      label: `${filters.year}年`,
      onClear: () => setFilter('year')(undefined)
    },
    filters.quarter != null && {
      key: 'quarter',
      label: QUARTER_LABEL[filters.quarter] ?? '',
      onClear: () => setFilter('quarter')(undefined)
    },
    filters.status != null && {
      key: 'status',
      label: STATUS_LABEL[filters.status] ?? filters.status,
      onClear: () => setFilter('status')(undefined)
    },
    badge != null && {
      key: 'badge',
      label: BADGE_LABEL[badge] ?? badge,
      onClear: () => setFilter('badge')(undefined)
    },
    filters.exclusive != null && {
      key: 'exclusive',
      label: filters.exclusive ? '独占配信のみ' : '複数プロバイダ',
      onClear: () => setFilter('exclusive')(undefined)
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
    <div className='space-y-5'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>アニメ一覧</h1>
        <p className='mt-1 text-sm text-muted-foreground'>{total} 件のアニメを管理中</p>
      </div>

      <SearchBar value={filters.search} onChange={setFilter('search')} />

      <div className='flex flex-wrap items-center gap-2'>
        <FilterPopover
          label='配信元'
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
          options={[{ value: undefined, label: 'すべて' }, ...years.map((y) => ({ value: y, label: `${y}年` }))]}
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
          value={badge}
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
        <FilterPopover<SortValue | undefined>
          label='並び替え'
          value={sortValue}
          options={SORT_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
          onSelect={onSortChange}
        />
        {hasFilters && (
          <Button type='button' size='lg' variant='ghost' onClick={resetFilters} className='text-muted-foreground'>
            <X />
            リセット
          </Button>
        )}
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
