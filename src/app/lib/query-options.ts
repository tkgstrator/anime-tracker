import { queryOptions } from '@tanstack/react-query'
import api from './api'
import { queryKeys } from './query-keys'

export const animeListQueryOptions = (filters: Record<string, unknown>) =>
  queryOptions({ queryKey: queryKeys.anime.list(filters), queryFn: () => api.getAnimeList({ queries: filters }) })

export const animeDetailQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.anime.detail(id), queryFn: () => api.getAnime({ params: { id } }) })

export const nagisaStatusQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.nagisa.status, queryFn: () => api.getNagisaStatus(), refetchInterval: 15_000 })
