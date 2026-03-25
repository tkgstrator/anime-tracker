import { Link, useRouter } from '@tanstack/react-router'
import { motion } from 'motion/react'

function getStatusCode(error: Error): number | undefined {
  if ('status' in error && typeof (error as Record<string, unknown>).status === 'number') {
    return (error as Record<string, unknown>).status as number
  }
  if ('statusCode' in error && typeof (error as Record<string, unknown>).statusCode === 'number') {
    return (error as Record<string, unknown>).statusCode as number
  }
  return undefined
}

function getStatusLabel(code: number): string {
  const labels: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable'
  }
  return labels[code] ?? 'Error'
}

export function ErrorPage({ error }: { error: Error }) {
  const router = useRouter()
  const statusCode = getStatusCode(error)

  return (
    <motion.div
      className='flex min-h-[60vh] items-center justify-center'
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
    >
      <div className='flex flex-col items-center gap-8 text-center'>
        {/* Status code or icon */}
        <motion.div
          className='flex flex-col items-center gap-2'
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.1, 0.25, 1] }}
        >
          {statusCode ? (
            <>
              <span className='text-8xl font-bold tracking-tighter text-foreground/10 sm:text-9xl'>{statusCode}</span>
              <span className='text-xs font-medium uppercase tracking-widest text-muted-foreground/60'>
                {getStatusLabel(statusCode)}
              </span>
            </>
          ) : (
            <div className='relative flex h-24 w-24 items-center justify-center'>
              <div className='absolute inset-0 rounded-full bg-destructive/10' />
              <svg
                width='40'
                height='40'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='1.5'
                strokeLinecap='round'
                strokeLinejoin='round'
                className='text-destructive'
                role='img'
              >
                <title>エラー</title>
                <circle cx='12' cy='12' r='10' />
                <line x1='12' y1='8' x2='12' y2='12' />
                <line x1='12' y1='16' x2='12.01' y2='16' />
              </svg>
            </div>
          )}
        </motion.div>

        <motion.div
          className='space-y-3'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <h1 className='text-2xl font-bold tracking-tight'>問題が発生しました</h1>
          <p className='max-w-sm text-sm leading-relaxed text-muted-foreground'>
            {error.message || '予期しないエラーが発生しました。しばらく経ってからもう一度お試しください。'}
          </p>
        </motion.div>

        <motion.div
          className='flex items-center gap-3 pt-2'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.35 }}
        >
          <button
            type='button'
            onClick={() => router.invalidate()}
            className='rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80'
          >
            再読み込み
          </button>
          <Link
            to='/'
            className='rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground'
          >
            ホームに戻る
          </Link>
        </motion.div>
      </div>
    </motion.div>
  )
}
