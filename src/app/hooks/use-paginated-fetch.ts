import { useCallback, useEffect, useState } from 'react'
import type { PaginatedAnimeSchema } from '@/schemas/anime.dto'

export function usePaginatedFetch(
  initialData: PaginatedAnimeSchema,
  fetcher: (page: number) => Promise<PaginatedAnimeSchema>
) {
  const [data, setData] = useState(initialData.data)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(initialData.totalPages)
  const [total, setTotal] = useState(initialData.total)
  const [initialized, setInitialized] = useState(false)

  const refetch = useCallback(async () => {
    try {
      const res = await fetcher(page)
      setData(res.data)
      setTotalPages(res.totalPages)
      setTotal(res.total)
    } catch (e) {
      console.error('Failed to fetch data', e)
    }
  }, [page, fetcher])

  useEffect(() => {
    if (!initialized) {
      setInitialized(true)
      return
    }
    refetch()
  }, [refetch, initialized])

  return { data, page, setPage, totalPages, total } as const
}
