import { queryOptions } from '@tanstack/react-query'
import api from './api'
import { queryKeys } from './query-keys'

export const animeListQueryOptions = (filters: Record<string, unknown>) =>
  queryOptions({ queryKey: queryKeys.anime.list(filters), queryFn: () => api.getAnimeList({ queries: filters }) })

const scheduledCountFilters = { scheduled: true, limit: 1, page: 1 } as const

export const scheduledCountQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.anime.list(scheduledCountFilters as Record<string, unknown>),
    queryFn: () => api.getAnimeList({ queries: scheduledCountFilters }),
    select: (data) => data.total,
    staleTime: 30_000
  })

export const badgedAnimeQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.anime.badged, queryFn: () => api.getBadgedAnime() })

export const animeDetailQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.anime.detail(id), queryFn: () => api.getAnime({ params: { id } }) })

export const nagisaStatusQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.nagisa.status, queryFn: () => api.getNagisaStatus(), refetchInterval: 15_000 })

export const unidentifiedListQueryOptions = (filters: Record<string, unknown>) =>
  queryOptions({
    queryKey: queryKeys.admin.unidentified(filters),
    queryFn: () => api.getUnidentifiedList({ queries: filters })
  })

export type ChangelogEntry = { hash: string; date: string; message: string }

export const changelogQueryOptions = () =>
  queryOptions({
    queryKey: queryKeys.changelog,
    queryFn: async (): Promise<ChangelogEntry[]> => {
      const res = await fetch('/commits.json')
      if (!res.ok) throw new Error(`Failed to load changelog: ${res.status}`)
      return res.json()
    },
    staleTime: 5 * 60 * 1000
  })
