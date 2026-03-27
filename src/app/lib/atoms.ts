import { atomWithStorage } from 'jotai/utils'
import { atomWithQuery } from 'jotai-tanstack-query'
import { nagisaStatusQueryOptions } from './query-options'

export const nagisaStatusAtom = atomWithQuery(() => nagisaStatusQueryOptions())

export const filterProviderAtom = atomWithStorage<string | undefined>('filter-provider', undefined)
export const filterYearAtom = atomWithStorage<number | undefined>('filter-year', undefined)
export const filterQuarterAtom = atomWithStorage<number | undefined>('filter-quarter', undefined)
export const filterStatusAtom = atomWithStorage<string | undefined>('filter-status', undefined)
export const sortAtom = atomWithStorage<'title' | 'year'>('filter-sort', 'title')
export const orderAtom = atomWithStorage<'asc' | 'desc'>('filter-order', 'asc')
export const searchAtom = atomWithStorage<string>('filter-search', '')
export const pageAtom = atomWithStorage('filter-page', 1)
