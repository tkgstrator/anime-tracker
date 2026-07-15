import { createFileRoute, Link } from '@tanstack/react-router'
import { FileQuestion, Send } from 'lucide-react'

export const Route = createFileRoute('/admin/')({
  component: AdminHubPage
})

const ADMIN_ITEMS: {
  to: '/admin/unidentified' | '/admin/nagisa'
  title: string
  description: string
  icon: typeof FileQuestion
}[] = [
  {
    to: '/admin/unidentified',
    title: '未識別タイトル一覧',
    description: 'AniList で識別できなかったタイトルを確認・調整する',
    icon: FileQuestion
  },
  {
    to: '/admin/nagisa',
    title: 'Nagisa ジョブ投入',
    description: 'プロバイダと content_id を指定して Nagisa に録画ジョブを直接投入する',
    icon: Send
  }
]

function AdminHubPage() {
  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>管理</h1>
        <p className='mt-1 text-sm text-muted-foreground'>運用・デバッグ用のツール</p>
      </div>

      <div className='grid gap-3 sm:grid-cols-2'>
        {ADMIN_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className='group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-muted'
            >
              <div className='mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground transition-colors group-hover:bg-background group-hover:text-foreground'>
                <Icon className='size-4' />
              </div>
              <div className='min-w-0 flex-1 space-y-0.5'>
                <h2 className='text-sm font-semibold'>{item.title}</h2>
                <p className='text-xs text-muted-foreground'>{item.description}</p>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
