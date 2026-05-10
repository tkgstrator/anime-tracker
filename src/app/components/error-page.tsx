import { Link, useRouter } from '@tanstack/react-router'
import { AlertCircle } from 'lucide-react'
import { motion } from 'motion/react'
import { Button } from '@/app/components/ui/button'

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
              <AlertCircle className='size-10 text-destructive' aria-label='エラー' />
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
          <Button type='button' size='lg' onClick={() => router.invalidate()}>
            再読み込み
          </Button>
          <Button size='lg' variant='outline' render={<Link to='/' />}>
            ホームに戻る
          </Button>
        </motion.div>
      </div>
    </motion.div>
  )
}
