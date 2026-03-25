import { Link } from '@tanstack/react-router'
import { motion } from 'motion/react'

export function NotFoundPage() {
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
          <span className='text-8xl font-bold tracking-tighter text-foreground/10 sm:text-9xl'>404</span>
          <span className='text-xs font-medium uppercase tracking-widest text-muted-foreground/60'>Not Found</span>
        </motion.div>

        <motion.div
          className='space-y-3'
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <h1 className='text-2xl font-bold tracking-tight'>ページが見つかりません</h1>
          <p className='max-w-sm text-sm leading-relaxed text-muted-foreground'>
            お探しのページは存在しないか、移動された可能性があります。
            <br />
            URLを確認するか、ホームに戻ってください。
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.35 }}
          className='pt-2'
        >
          <Link
            to='/'
            className='rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-80'
          >
            ホームに戻る
          </Link>
        </motion.div>
      </div>
    </motion.div>
  )
}
