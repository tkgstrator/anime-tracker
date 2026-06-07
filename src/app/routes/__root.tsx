import type { QueryClient } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRootRouteWithContext, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import dayjs from 'dayjs'
import { Toaster } from 'sonner'
import { ErrorPage } from '@/app/components/error-page'
import { GlobalSearchBar } from '@/app/components/global-search-bar'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { NotFoundPage } from '@/app/components/not-found-page'
import { ServerStatusDialog } from '@/app/components/server-status-dialog'
import { Badge } from '@/app/components/ui/badge'
import { scheduledCountQueryOptions } from '@/app/lib/query-options'

const navLinkClass =
  'text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground [&.active]:font-medium'

function RecordingsBadge() {
  const { data: count } = useQuery(scheduledCountQueryOptions())
  if (!count || count <= 0) return null
  return (
    <Badge variant='secondary' className='h-4 min-w-4 px-1 text-[10px]'>
      {count}
    </Badge>
  )
}

const RootComponent = () => {
  return (
    <div className='min-h-screen select-none bg-background'>
      <header className='sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm'>
        <div className='flex h-14 items-center gap-6 px-6 lg:px-8 xl:px-12'>
          <Link to='/' className='shrink-0 text-lg font-bold tracking-tight'>
            Nagisa
          </Link>
          <nav className='flex shrink-0 items-center gap-5 text-sm'>
            <Link to='/' className={navLinkClass}>
              ホーム
            </Link>
            <Link to='/browse' className={navLinkClass}>
              一覧
            </Link>
            <Link to='/recordings' className={`${navLinkClass} flex items-center gap-1.5`}>
              録画
              <RecordingsBadge />
            </Link>
          </nav>
          <GlobalSearchBar />
          <ServerStatusDialog />
        </div>
      </header>
      <main className='select-text px-6 py-8 lg:px-8 xl:px-12'>
        <Outlet />
      </main>
      <footer className='py-4 text-center text-xs text-muted-foreground'>
        <Link to='/changelog' className='transition-colors hover:text-foreground'>
          v{__APP_VERSION__} ({__GIT_HASH__}) {dayjs(__GIT_DATE__).format('YYYY/MM/DD HH:mm:ss')}
        </Link>
        <p className='mt-0.5 flex items-center justify-center gap-2'>
          <span>&copy; {dayjs().year()} Nagisa</span>
          <Link to='/admin/unidentified' className='transition-colors hover:text-foreground'>
            管理
          </Link>
          <a
            href='https://github.com/tkgstrator/nagisa-webui'
            target='_blank'
            rel='noopener noreferrer'
            className='transition-colors hover:text-foreground'
          >
            <svg viewBox='0 0 24 24' fill='currentColor' className='size-3.5' aria-label='GitHub'>
              <path d='M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z' />
            </svg>
          </a>
        </p>
      </footer>
      <Toaster richColors position='top-right' />
      <TanStackRouterDevtools position='bottom-right' />
      <ReactQueryDevtools buttonPosition='bottom-left' />
    </div>
  )
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: RootComponent,
  pendingComponent: LoadingSpinner,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
  notFoundComponent: NotFoundPage
})
