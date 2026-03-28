import type { QueryClient } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { createRootRouteWithContext, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { AnimatePresence } from 'motion/react'
import { Toaster } from 'sonner'
import { ErrorPage } from '@/app/components/error-page'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { NotFoundPage } from '@/app/components/not-found-page'
import { ServerStatusDialog } from '@/app/components/server-status-dialog'

const RootComponent = () => {
  const routeKey = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className='min-h-screen select-none bg-background'>
      <header className='sticky top-0 z-50 bg-background/80 backdrop-blur-sm'>
        <div className='mx-auto flex h-14 max-w-screen-xl items-center gap-8 px-6'>
          <Link to='/' className='text-lg font-bold tracking-tight'>
            Anime Tracker
          </Link>
          <nav className='flex items-center gap-6 text-sm'>
            <Link
              to='/'
              className='text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground [&.active]:font-medium'
            >
              ホーム
            </Link>
            <Link
              to='/browse'
              className='text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground [&.active]:font-medium'
            >
              一覧
            </Link>
            <Link
              to='/recordings'
              className='text-muted-foreground transition-colors hover:text-foreground [&.active]:text-foreground [&.active]:font-medium'
            >
              録画
            </Link>
          </nav>
          <ServerStatusDialog />
        </div>
      </header>
      <main className='mx-auto max-w-screen-xl select-text px-6 py-8'>
        <AnimatePresence mode='wait'>
          <Outlet key={routeKey} />
        </AnimatePresence>
      </main>
      <footer className='py-4 text-center text-xs text-muted-foreground'>
        <Link to='/changelog' className='transition-colors hover:text-foreground'>
          v{__APP_VERSION__} ({__GIT_HASH__}){' '}
          {new Date(__GIT_DATE__)
            .toLocaleString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
              hour12: false
            })
            .replace(/\//g, '/')}
        </Link>
        <p className='mt-0.5'>&copy; {new Date().getFullYear()} Anime Tracker</p>
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
