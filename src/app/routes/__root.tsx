import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import { Toaster } from 'sonner'

const RootComponent = () => {
  return (
    <div className='min-h-screen bg-background'>
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
              アニメ
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
        <Outlet />
      </main>
      <Toaster richColors position='top-right' />
      <TanStackRouterDevtools position='bottom-right' />
    </div>
  )
}

export const Route = createRootRoute({
  component: RootComponent
})
