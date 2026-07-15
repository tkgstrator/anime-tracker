import { X } from 'lucide-react'
import { Button } from '@/app/components/ui/button'

export type FilterOption<T> = { value: T; label: string }

type FilterGroupProps<T extends string | number | undefined> = {
  label: string
  value: T
  options: FilterOption<T>[]
  onSelect: (value: T) => void
}

function FilterGroup<T extends string | number | undefined>({ label, value, options, onSelect }: FilterGroupProps<T>) {
  return (
    <fieldset className='space-y-1.5'>
      <legend className='text-xs font-semibold uppercase tracking-wide text-muted-foreground'>{label}</legend>
      <div className='flex flex-wrap gap-1'>
        {options.map((opt) => {
          const selected = value === opt.value
          return (
            <button
              key={String(opt.value === undefined ? 'all' : opt.value)}
              type='button'
              onClick={() => onSelect(opt.value)}
              aria-pressed={selected}
              className='inline-flex h-7 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground aria-pressed:bg-accent aria-pressed:font-medium aria-pressed:text-accent-foreground'
            >
              {opt.label}
            </button>
          )
        })}
      </div>
    </fieldset>
  )
}

type FilterSidebarProps = {
  provider: string | undefined
  year: number | undefined
  quarter: number | undefined
  status: string | undefined
  badge: string | undefined
  sortValue: string
  years: number[]
  hasFilters: boolean
  sortOptions: { value: string; label: string }[]
  onChangeProvider: (value: string | undefined) => void
  onChangeYear: (value: number | undefined) => void
  onChangeQuarter: (value: number | undefined) => void
  onChangeStatus: (value: string | undefined) => void
  onChangeBadge: (value: string | undefined) => void
  onChangeSort: (value: string) => void
  onReset: () => void
}

export function FilterSidebar({
  provider,
  year,
  quarter,
  status,
  badge,
  sortValue,
  years,
  hasFilters,
  sortOptions,
  onChangeProvider,
  onChangeYear,
  onChangeQuarter,
  onChangeStatus,
  onChangeBadge,
  onChangeSort,
  onReset
}: FilterSidebarProps) {
  return (
    <aside className='space-y-5 lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto lg:pr-1'>
      <div className='flex items-center justify-between'>
        <h2 className='text-sm font-semibold tracking-tight'>絞り込み</h2>
        {hasFilters && (
          <Button type='button' size='sm' variant='ghost' onClick={onReset} className='h-7 px-2 text-muted-foreground'>
            <X className='size-3.5' />
            リセット
          </Button>
        )}
      </div>

      <FilterGroup
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
        onSelect={onChangeProvider}
      />

      <FilterGroup<number | undefined>
        label='年'
        value={year}
        options={[{ value: undefined, label: 'すべて' }, ...years.map((y) => ({ value: y, label: `${y}年` }))]}
        onSelect={onChangeYear}
      />

      <FilterGroup<number | undefined>
        label='シーズン'
        value={quarter}
        options={[
          { value: undefined, label: 'すべて' },
          { value: 0, label: '冬' },
          { value: 1, label: '春' },
          { value: 2, label: '夏' },
          { value: 3, label: '秋' }
        ]}
        onSelect={onChangeQuarter}
      />

      <FilterGroup
        label='ステータス'
        value={status}
        options={[
          { value: undefined, label: 'すべて' },
          { value: 'RELEASING', label: '放送中' },
          { value: 'FINISHED', label: '完結' },
          { value: 'NOT_YET_RELEASED', label: '未放送' },
          { value: 'CANCELLED', label: '中止' },
          { value: 'HIATUS', label: '休止' }
        ]}
        onSelect={onChangeStatus}
      />

      <FilterGroup
        label='バッジ'
        value={badge}
        options={[
          { value: undefined, label: 'すべて' },
          { value: 'NEW_EPISODE', label: '新着エピソード' },
          { value: 'RECENTLY_ADDED', label: '新着追加' },
          { value: 'COMING_SOON', label: '配信予定' },
          { value: 'EXPIRING', label: '配信終了予定' }
        ]}
        onSelect={onChangeBadge}
      />

      <FilterGroup
        label='並び替え'
        value={sortValue}
        options={sortOptions}
        onSelect={(v) => onChangeSort(v as string)}
      />
    </aside>
  )
}
