import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useState } from 'react'

type CommitEntry = { hash: string; date: string; message: string }

const ChangelogPage = () => {
  const [commits, setCommits] = useState<CommitEntry[]>([])

  useEffect(() => {
    fetch('/commits.json')
      .then((res) => res.json() as Promise<CommitEntry[]>)
      .then(setCommits)
      .catch((e) => console.warn('[changelog] fetch failed:', e))
  }, [])

  const grouped = commits.reduce<Record<string, CommitEntry[]>>((acc, c) => {
    if (!acc[c.date]) acc[c.date] = []
    acc[c.date].push(c)
    return acc
  }, {})

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
