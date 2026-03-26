import { createFileRoute } from '@tanstack/react-router'
import { groupBy } from 'lodash-es'
import { useEffect, useState } from 'react'

type CommitEntry = { hash: string; date: string; message: string }

const ChangelogPage = () => {
  const [commits, setCommits] = useState<CommitEntry[]>([])

  useEffect(() => {
    fetch('/commits.json')
      .then((res) => res.json() as Promise<CommitEntry[]>)
      .then(setCommits)
      .catch(() => {})
  }, [])

  const grouped = groupBy(commits, (c) => c.date)

  return (
    <div className='space-y-6'>
      <h1 className='text-lg font-bold'>Changelog</h1>
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

export const Route = createFileRoute('/changelog/')({
  component: ChangelogPage
})
