import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { type ChangelogEntry, changelogQueryOptions } from '@/app/lib/query-options'

export const Route = createFileRoute('/changelog/')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(changelogQueryOptions()),
  pendingComponent: LoadingSpinner,
  component: ChangelogPage
})

function ChangelogPage() {
  const { data: commits } = useSuspenseQuery(changelogQueryOptions())

  const grouped = commits.reduce<Record<string, ChangelogEntry[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = []
    acc[c.date].push(c)
    return acc
  }, {})

  return (
    <div className='space-y-6'>
      <h1 className='text-2xl font-bold tracking-tight'>Changelog</h1>
      {Object.entries(grouped).map(([date, entries]) => (
        <section key={date}>
          <h2 className='mb-2 text-sm font-medium text-muted-foreground'>{date}</h2>
          <ul className='space-y-1'>
            {entries.map((entry) => (
              <li key={entry.hash} className='flex items-baseline gap-2 text-sm'>
                <code className='shrink-0 text-xs text-muted-foreground'>{entry.hash}</code>
                <span>{entry.message}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
