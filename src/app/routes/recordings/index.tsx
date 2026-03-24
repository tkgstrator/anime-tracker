import { createFileRoute, Link } from '@tanstack/react-router'
import { useCallback, useEffect, useState } from 'react'

import { Badge } from '@/app/components/ui/badge'
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
import { providerColor, providerLabel, statusColor, statusLabel } from '@/app/lib/constants'
import { getCleanImageUrl } from '@/lib/image'
import { type AnimeSchema, QuarterLabel } from '@/schemas/anime.dto'

export const Route = createFileRoute('/recordings/')({
  component: RecordingsPage
})

const PAGE_SIZE = 24

function RecordingsPage() {
  const [anime, setAnime] = useState<AnimeSchema[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)

  const fetchScheduled = useCallback(async () => {
    try {
      const data = await api.getAnimeList({ queries: { scheduled: true, page, limit: PAGE_SIZE } })
      setAnime(data.data)
      setTotalPages(data.totalPages)
      setTotal(data.total)
    } catch (e) {
      console.error('Failed to fetch scheduled anime', e)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => {
    fetchScheduled()
  }, [fetchScheduled])

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
        <h1 className='text-2xl font-bold tracking-tight'>録画予約一覧</h1>
        <p className='mt-1 text-sm text-muted-foreground'>{total} 件の録画予約タイトル</p>
      </div>

      {anime.length === 0 ? (
        <div className='py-20 text-center'>
          <p className='text-muted-foreground'>録画予約されたタイトルはありません</p>
          <Link to='/' className='mt-2 inline-block text-sm text-blue-500 hover:underline'>
            アニメ一覧から予約する
          </Link>
        </div>
      ) : (
        <div className='divide-y divide-border/50'>
          {anime.map((item) => (
            <Link
              key={item.id}
              to='/anime/$id'
              params={{ id: item.id }}
              className='flex items-center gap-4 py-3 transition-colors hover:bg-muted/30'
            >
              {item.imageUrl && (
                <img
                  src={getCleanImageUrl(item.imageUrl)}
                  alt={item.title}
                  className='h-16 w-28 shrink-0 rounded object-cover'
                />
              )}
              <div className='min-w-0 flex-1'>
                <p className='truncate font-medium'>{item.title}</p>
                <div className='mt-1 flex flex-wrap items-center gap-1.5'>
                  <Badge variant='secondary' className={providerColor[item.provider] ?? ''}>
                    {providerLabel[item.provider] ?? item.provider}
                  </Badge>
                  {item.status && item.status !== 'UNKNOWN' && (
                    <Badge variant='secondary' className={statusColor[item.status] ?? ''}>
                      {statusLabel[item.status] ?? item.status}
                    </Badge>
                  )}
                  {item.year > 0 && (
                    <span className='text-xs text-muted-foreground'>
                      {item.year}年{item.quarter != null ? ` ${QuarterLabel[item.quarter]}` : ''}
                    </span>
                  )}
                  {item.recorded && (
                    <Badge variant='secondary' className='bg-emerald-500/15 text-emerald-700'>
                      録画済み
                    </Badge>
                  )}
                </div>
              </div>
            </Link>
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
