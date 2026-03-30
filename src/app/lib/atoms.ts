import { atomWithStorage } from 'jotai/utils'
import { atomWithQuery } from 'jotai-tanstack-query'
import { nagisaStatusQueryOptions } from './query-options'

export const nagisaStatusAtom = atomWithQuery(() => nagisaStatusQueryOptions())

interface BrowseFilters {
  provider?: string
  year?: number
  quarter?: number
  status?: string
  badge?: string
  aniListId?: number
  exclusive?: boolean
  sort: 'title' | 'year'
  order: 'asc' | 'desc'
  search: string
  page: number
}

const defaultFilters: BrowseFilters = {
  sort: 'title',
  order: 'asc',
  search: '',
  page: 1
}

export const browseFiltersAtom = atomWithStorage<BrowseFilters>('browse-filters', defaultFilters)
export type { BrowseFilters }
export { defaultFilters as defaultBrowseFilters }
