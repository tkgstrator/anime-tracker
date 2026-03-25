import { createRootRoute, Link, Outlet, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { AnimatePresence } from 'motion/react'
import { Toaster } from 'sonner'
import { ErrorPage } from '@/app/components/error-page'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { NotFoundPage } from '@/app/components/not-found-page'

const RootComponent = () => {
  const routeKey = useRouterState({ select: (s) => s.location.pathname })

  return (
    <div className='min-h-screen select-none bg-background'>
      <header className='sticky top-0 z-50 bg-background/80 backdrop-blur-sm'>
        <div className='mx-auto flex h-14 max-w-6xl items-center gap-8 px-6'>
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
        </div>
      </header>
      <main className='mx-auto max-w-6xl px-6 py-8'>
        <AnimatePresence mode='wait'>
          <Outlet key={routeKey} />
        </AnimatePresence>
      </main>
      <Toaster richColors position='top-right' />
      <TanStackRouterDevtools position='bottom-right' />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootComponent,
  pendingComponent: LoadingSpinner,
  errorComponent: ({ error }) => <ErrorPage error={error} />,
  notFoundComponent: NotFoundPage,
})
