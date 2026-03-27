import dayjs from 'dayjs'
import { useAtomValue } from 'jotai'
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Cpu,
  Database,
  HardDrive,
  Loader2,
  MemoryStick,
  Power,
  Server,
  Wifi,
  WifiOff,
  Zap
} from 'lucide-react'
import type { NagisaStatusSchema } from '@/schemas/nagisa.dto'
import { Badge } from '../lib/../components/ui/badge'
import { nagisaStatusAtom } from '../lib/atoms'
import { Button } from './ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from './ui/dialog'

const formatUptime = (seconds: number): string => {
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

const DUMMY_STATUS: NagisaStatusSchema = {
  version: '1.0.1',
  uptime: 268,
  queue: { wait: 1, active: 1, completed: 37, failed: 0, delayed: 0 },
  active_jobs: [
    {
      job_id: '185',
      provider: 'hulu',
      content_id: 'fate-strange-fake',
      title: 'Fate/strange Fake',
      seasons: [{ season_number: 1, episodes: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }],
      timestamp: 1774576887705,
      processedOn: 1774576887707,
      progress: { current: 2, total: 12 }
    }
  ],
  redis: { connected: true, memory_used: '3.00M', uptime: 2929672 },
  system: { cpu_percent: 37.3, memory_percent: 21.9, disk_free_gb: 2074.7 }
}

export const ServerStatusDialog = () => {
  const remoteStatus = useAtomValue(nagisaStatusAtom)
  const status = import.meta.env.DEV ? (remoteStatus ?? DUMMY_STATUS) : remoteStatus

  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button variant='ghost' size='icon-sm' className='ml-auto text-muted-foreground hover:text-foreground' />
        }
      >
        <Server className='size-4' />
      </DialogTrigger>
      <DialogContent className='select-none sm:max-w-lg'>
        <DialogHeader>
          <DialogTitle>Nagisa</DialogTitle>
        </DialogHeader>
        {status === null ? (
          <div className='flex items-center gap-3 py-2'>
            <WifiOff className='size-5 text-red-500' />
            <div>
              <p className='text-sm font-medium'>Offline</p>
              <p className='text-xs text-muted-foreground'>Cannot reach Nagisa server</p>
            </div>
          </div>
        ) : (
          <div className='space-y-5'>
            <div className='flex items-center justify-between'>
              <div className='flex items-center gap-3'>
                <Wifi className='size-5 text-green-500' />
                <div>
                  <p className='text-sm font-medium'>Online</p>
                  <p className='text-xs text-muted-foreground'>Uptime: {formatUptime(status.uptime)}</p>
                </div>
              </div>
              <Badge variant='secondary' className='font-mono'>
                v{status.version}
              </Badge>
            </div>

            {status.queue && (
              <div className='grid grid-cols-5 gap-1.5'>
                <QueueStat icon={Clock} label='Wait' value={status.queue.wait} />
                <QueueStat icon={Loader2} label='Active' value={status.queue.active} active />
                <QueueStat icon={CheckCircle} label='Done' value={status.queue.completed} />
                <QueueStat
                  icon={AlertTriangle}
                  label='Fail'
                  value={status.queue.failed}
                  error={status.queue.failed > 0}
                />
                <QueueStat icon={Zap} label='Delay' value={status.queue.delayed} />
              </div>
            )}

            {status.active_jobs.length > 0 && (
              <div className='space-y-2'>
                <div className='flex items-center gap-3'>
                  <Activity className='size-5 text-blue-500' />
                  <p className='text-sm font-medium'>
                    Active Jobs ({status.active_jobs.length})
                  </p>
                </div>
                <div className='space-y-1.5'>
                  {status.active_jobs.map((job) => (
                    <div key={job.job_id} className='rounded-lg bg-muted/40 px-3 py-2'>
                      <div className='flex items-center gap-2'>
                        <span className='inline-block size-1.5 shrink-0 animate-pulse rounded-full bg-blue-500' />
                        <p className='min-w-0 flex-1 truncate text-xs font-medium'>
                          {job.title ?? job.content_id}
                        </p>
                        <span className='shrink-0 text-xs text-muted-foreground'>
                          {job.provider}
                        </span>
                      </div>
                      <div className='mt-1 flex items-center gap-1.5 pl-3.5'>
                        {job.seasons && job.seasons.length > 0 && (
                          <span className='text-[10px] text-muted-foreground'>
                            {job.seasons
                              .map((s) => {
                                const ep = s.episodes
                                if (!ep || ep.length === 0) return `S${s.season_number}`
                                return `S${s.season_number} Ep${ep[0]}–${ep[ep.length - 1]}`
                              })
                              .join(', ')}
                          </span>
                        )}
                        <span className='ml-auto text-[10px] text-muted-foreground'>
                          {dayjs(job.processedOn ?? job.timestamp).format('MM/DD HH:mm')}
                        </span>
                      </div>
                      {job.progress && (
                        <div className='mt-1.5 flex items-center gap-2 pl-3.5'>
                          <div className='h-1 flex-1 overflow-hidden rounded-full bg-muted'>
                            <div
                              className='h-full rounded-full bg-blue-500 transition-all'
                              style={{ width: `${(job.progress.current / job.progress.total) * 100}%` }}
                            />
                          </div>
                          <span className='text-[10px] tabular-nums text-muted-foreground'>
                            {job.progress.current}/{job.progress.total}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {(status.redis || status.system) && (
              <div className='grid grid-cols-2 gap-3'>
                {status.redis && (
                  <div className='space-y-2 rounded-lg bg-muted/40 p-3'>
                    <div className='flex items-center gap-2'>
                      <Database className='size-3.5 text-muted-foreground' />
                      <p className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>Redis</p>
                    </div>
                    <div className='space-y-1 text-xs'>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <Power className='size-3' />
                          Status
                        </span>
                        <span className={status.redis.connected ? 'text-green-500' : 'text-red-500'}>
                          {status.redis.connected ? 'Connected' : 'Disconnected'}
                        </span>
                      </div>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <MemoryStick className='size-3' />
                          Memory
                        </span>
                        <span className='font-mono'>{status.redis.memory_used}</span>
                      </div>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <Clock className='size-3' />
                          Uptime
                        </span>
                        <span>{formatUptime(status.redis.uptime)}</span>
                      </div>
                    </div>
                  </div>
                )}
                {status.system && (
                  <div className='space-y-2 rounded-lg bg-muted/40 p-3'>
                    <div className='flex items-center gap-2'>
                      <Cpu className='size-3.5 text-muted-foreground' />
                      <p className='text-xs font-medium uppercase tracking-wider text-muted-foreground'>System</p>
                    </div>
                    <div className='space-y-1 text-xs'>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <Cpu className='size-3' />
                          CPU
                        </span>
                        <span className='font-mono'>{status.system.cpu_percent.toFixed(1)}%</span>
                      </div>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <MemoryStick className='size-3' />
                          RAM
                        </span>
                        <span className='font-mono'>{status.system.memory_percent.toFixed(1)}%</span>
                      </div>
                      <div className='flex items-center justify-between'>
                        <span className='inline-flex items-center gap-1 text-muted-foreground'>
                          <HardDrive className='size-3' />
                          Disk
                        </span>
                        <span className='font-mono'>{status.system.disk_free_gb.toFixed(1)} GB</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

const QueueStat = ({
  icon: Icon,
  label,
  value,
  active,
  error
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  active?: boolean
  error?: boolean
}) => (
  <div className='flex flex-col items-center gap-1 rounded-lg bg-muted/40 px-1 py-2'>
    <Icon
      className={`size-3.5 ${
        error ? 'text-red-500' : active && value > 0 ? 'animate-spin text-blue-500' : 'text-muted-foreground'
      }`}
    />
    <span className={`text-base font-semibold tabular-nums ${error ? 'text-red-500' : ''}`}>{value}</span>
    <span className='text-[10px] text-muted-foreground'>{label}</span>
  </div>
)
