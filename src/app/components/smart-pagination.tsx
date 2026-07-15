import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious
} from '@/app/components/ui/pagination'

type PageItem = number | 'ellipsis-start' | 'ellipsis-end'

function buildPageNumbers(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }
  const hasStartEllipsis = page > 4
  const hasEndEllipsis = page < totalPages - 3
  const middleSlots = 7 - (hasStartEllipsis ? 2 : 1) - (hasEndEllipsis ? 2 : 1)
  const middleStart = hasStartEllipsis
    ? hasEndEllipsis
      ? page - Math.floor((middleSlots - 1) / 2)
      : totalPages - middleSlots
    : 2
  const middle = Array.from({ length: middleSlots }, (_, i) => middleStart + i)
  return [
    1,
    ...(hasStartEllipsis ? (['ellipsis-start'] as const) : []),
    ...middle,
    ...(hasEndEllipsis ? (['ellipsis-end'] as const) : []),
    totalPages
  ]
}

export function SmartPagination({
  page,
  totalPages,
  onPageChange
}: {
  page: number
  totalPages: number
  onPageChange: (page: number) => void
}) {
  if (totalPages <= 1) return null

  return (
    <Pagination>
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            text='前へ'
            onClick={() => onPageChange(Math.max(1, page - 1))}
            className={page === 1 ? 'pointer-events-none opacity-30' : 'cursor-pointer'}
          />
        </PaginationItem>
        {buildPageNumbers(page, totalPages).map((p) =>
          typeof p === 'string' ? (
            <PaginationItem key={p}>
              <PaginationEllipsis />
            </PaginationItem>
          ) : (
            <PaginationItem key={p}>
              <PaginationLink isActive={page === p} onClick={() => onPageChange(p)} className='cursor-pointer'>
                {p}
              </PaginationLink>
            </PaginationItem>
          )
        )}
        <PaginationItem>
          <PaginationNext
            text='次へ'
            onClick={() => onPageChange(Math.min(totalPages, page + 1))}
            className={page === totalPages ? 'pointer-events-none opacity-30' : 'cursor-pointer'}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
