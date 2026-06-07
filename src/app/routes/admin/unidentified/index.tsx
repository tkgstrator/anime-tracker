import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { ArrowDownUp, Film } from 'lucide-react'
import { useState } from 'react'
import { z } from 'zod'
import { ProviderBadge } from '@/app/components/anime-badges'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { ProxyImage } from '@/app/components/proxy-image'
import { SmartPagination } from '@/app/components/smart-pagination'
import { Button } from '@/app/components/ui/button'
import { providerLabel } from '@/app/lib/constants'
import { unidentifiedListQueryOptions } from '@/app/lib/query-options'
import { getProviderTitleUrl } from '@/app/routes/anime/$id/-lib/format'
import { FilterPopover } from '@/app/routes/browse/-components/filter-popover'
import { SearchBar } from '@/app/routes/browse/-components/search-bar'
import { ProviderTypeEnum } from '@/schemas/message.dto'

const PAGE_SIZE = 30

const Order = z.enum(['asc', 'desc'])

const SearchSchema = z.object({
  provider: ProviderTypeEnum.optional(),
  q: z.string().nonempty().optional(),
  order: Order.default('desc')
})

type Provider = z.infer<typeof ProviderTypeEnum>

const PROVIDER_FILTER_OPTIONS: { value: Provider | undefined; label: string }[] = [
  { value: undefined, label: 'すべて' },
  { value: 'amazon', label: providerLabel.amazon ?? 'amazon' },
  { value: 'hulu', label: providerLabel.hulu ?? 'hulu' },
  { value: 'crunchyroll', label: providerLabel.crunchyroll ?? 'crunchyroll' },
  { value: 'abema', label: providerLabel.abema ?? 'abema' }
]

export const Route = createFileRoute('/admin/unidentified/')({
  validateSearch: SearchSchema,
  loaderDeps: ({ search }) => search,
  loader: ({ context: { queryClient }, deps }) =>
    queryClient.ensureQueryData(
      unidentifiedListQueryOptions({
        page: 1,
        limit: PAGE_SIZE,
        provider: deps.provider,
        q: deps.q,
        order: deps.order
      })
    ),
  pendingComponent: LoadingSpinner,
  component: UnidentifiedAdminPage
})

function UnidentifiedAdminPage() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  const [page, setPage] = useState(1)

  const { data } = useQuery({
    ...unidentifiedListQueryOptions({
      page,
      limit: PAGE_SIZE,
      provider: search.provider,
      q: search.q,
      order: search.order
    }),
    placeholderData: keepPreviousData
  })

  const items = data?.data ?? []
  const total = data?.total ?? 0
  const totalPages = data?.totalPages ?? 0

  const updateSearch = (patch: Partial<z.infer<typeof SearchSchema>>) => {
    setPage(1)
    navigate({ search: (prev) => ({ ...prev, ...patch }) })
  }

  const toggleOrder = () => updateSearch({ order: search.order === 'desc' ? 'asc' : 'desc' })

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>未識別タイトル一覧</h1>
        <p className='mt-1 text-sm text-muted-foreground'>AniList で識別できなかった {total} 件のタイトル</p>
      </div>

      <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
        <div className='sm:flex-1'>
          <SearchBar value={search.q ?? ''} onChange={(v) => updateSearch({ q: v || undefined })} />
        </div>
        <FilterPopover
          label='プロバイダ'
          value={search.provider}
          options={PROVIDER_FILTER_OPTIONS}
          onSelect={(v) => updateSearch({ provider: v })}
        />
        <Button variant='outline' onClick={toggleOrder} className='sm:w-44'>
          <ArrowDownUp className='h-4 w-4' />
          更新日 {search.order === 'desc' ? '新しい順' : '古い順'}
        </Button>
      </div>

      {items.length === 0 ? (
        <div className='py-20 text-center text-sm text-muted-foreground'>該当するタイトルはありません</div>
      ) : (
        <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5'>
          {items.map((item) => {
            const providerUrl = getProviderTitleUrl(item.provider, item.contentId)
            const card = (
              <>
                <div className='relative aspect-video w-full overflow-hidden rounded-lg bg-muted'>
                  {item.imageUrl ? (
                    <ProxyImage
                      src={item.imageUrl}
                      alt={item.title}
                      width={480}
                      className='h-full w-full object-cover transition-transform duration-200 group-hover:scale-105'
                    />
                  ) : (
                    <div className='flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-muted-foreground'>
                      <Film className='size-6 opacity-60' aria-hidden='true' />
                      <span className='line-clamp-2 w-full break-all'>{item.title}</span>
                    </div>
                  )}
                </div>
                <p className='mt-1.5 truncate text-sm font-medium'>{item.title}</p>
                <div className='mt-0.5 flex items-center gap-1.5'>
                  <ProviderBadge provider={item.provider} className='text-[10px]' />
                  <span className='truncate font-mono text-[10px] text-muted-foreground'>{item.contentId}</span>
                </div>
                <p className='mt-0.5 text-[10px] text-muted-foreground'>
                  更新 {dayjs(item.updatedAt).format('YYYY-MM-DD HH:mm')}
                </p>
              </>
            )
            return providerUrl ? (
              <a key={item.id} href={providerUrl} target='_blank' rel='noopener noreferrer' className='group block'>
                {card}
              </a>
            ) : (
              <div key={item.id} className='block'>
                {card}
              </div>
            )
          })}
        </div>
      )}

      {totalPages > 1 && <SmartPagination page={page} totalPages={totalPages} onPageChange={setPage} />}
    </div>
  )
}
