import { motion } from 'motion/react'

export function LoadingSpinner() {
  return (
    <div className='flex min-h-[60vh] items-center justify-center'>
      <motion.div
        className='flex flex-col items-center gap-4'
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <motion.div
          className='h-8 w-8 rounded-full border-2 border-muted-foreground/20 border-t-foreground'
          animate={{ rotate: 360 }}
          transition={{ duration: 0.8, repeat: Number.POSITIVE_INFINITY, ease: 'linear' }}
        />
      </motion.div>
    </div>
  )
}
