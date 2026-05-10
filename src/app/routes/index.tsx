import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { AnimeCarousel } from '@/app/components/anime-carousel'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { providerLabel } from '@/app/lib/constants'
import { animeListQueryOptions, badgedAnimeQueryOptions } from '@/app/lib/query-options'
import type { AnimeSchema } from '@/schemas/anime.dto'

function getCurrentQuarter(): number {
  const month = dayjs().month()
  if (month < 3) return 0
  if (month < 6) return 1
  if (month < 9) return 2
  return 3
}

const homeQueries = () => {
  const currentYear = dayjs().year()
  const currentQuarter = getCurrentQuarter()
  return [
    animeListQueryOptions({ year: currentYear, quarter: currentQuarter, limit: 100, sort: 'title', order: 'asc' })
  ] as const
}

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(badgedAnimeQueryOptions()),
      ...homeQueries().map((opts) => queryClient.ensureQueryData(opts))
    ]),
  pendingComponent: LoadingSpinner,
  component: HomePage
})

function HomePage() {
  const { data: badged } = useSuspenseQuery(badgedAnimeQueryOptions())
  const [currentSeasonQ] = useSuspenseQueries({
    queries: [...homeQueries()]
  })

  const currentSeason = currentSeasonQ.data.data

  const byProvider = useMemo(() => {
    const grouped = new Map<string, AnimeSchema[]>()
    for (const anime of currentSeason) {
      const existing = grouped.get(anime.provider)
      if (existing) {
        existing.push(anime)
      } else {
        grouped.set(anime.provider, [anime])
      }
    }
    for (const list of grouped.values()) {
      for (const i of Array.from({ length: list.length - 1 }, (_, k) => list.length - 1 - k)) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
      }
    }
    return grouped
  }, [currentSeason])
  const currentYear = dayjs().year()
  const currentQuarter = getCurrentQuarter()
  const quarterLabel = ['冬', '春', '夏', '秋'][currentQuarter]

  return (
    <div className='space-y-10'>
      <AnimeCarousel
        title='新着エピソード'
        anime={badged.NEW_EPISODE}
        viewAllLink='/browse?badge=NEW_EPISODE'
        badgeType='nextEpisodeDate'
      />
      <AnimeCarousel
        title='最近追加されたアニメ'
        anime={badged.RECENTLY_ADDED}
        viewAllLink='/browse?badge=RECENTLY_ADDED'
      />
      <AnimeCarousel
        title='もうすぐ配信'
        anime={badged.COMING_SOON}
        viewAllLink='/browse?badge=COMING_SOON'
        badgeType='nextEpisodeDate'
      />
      <AnimeCarousel
        title='もうすぐ配信終了'
        anime={badged.EXPIRING}
        viewAllLink='/browse?badge=EXPIRING'
        badgeType='expiredAt'
      />
      <AnimeCarousel title={`${currentYear}年${quarterLabel}アニメ`} anime={currentSeason} viewAllLink='/browse' />
      {byProvider.size > 0 && (
        <section className='space-y-6'>
          <h2 className='text-xl font-bold tracking-tight'>配信元から探す</h2>
          {Array.from(byProvider.entries()).map(([provider, anime]) => (
            <AnimeCarousel
              key={provider}
              title={providerLabel[provider] ?? provider}
              anime={anime}
              viewAllLink={`/browse?provider=${provider}`}
              showProvider={false}
            />
          ))}
        </section>
      )}
    </div>
  )
}
