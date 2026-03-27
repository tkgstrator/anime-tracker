import { useSuspenseQueries } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { AnimeCarousel } from '@/app/components/anime-carousel'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { PageTransition } from '@/app/components/page-transition'
import { animeListQueryOptions } from '@/app/lib/query-options'
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
    animeListQueryOptions({ recentlyUpdated: true, limit: 50, sort: 'updatedAt', order: 'desc' }),
    animeListQueryOptions({ upcoming: true, limit: 20, sort: 'title', order: 'asc' }),
    animeListQueryOptions({ expiring: true, limit: 20, sort: 'title', order: 'asc' }),
    animeListQueryOptions({ year: currentYear, quarter: currentQuarter, limit: 20, sort: 'title', order: 'asc' }),
    animeListQueryOptions({ scheduled: true, limit: 20, sort: 'title', order: 'asc' })
  ] as const
}

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => Promise.all(homeQueries().map((opts) => queryClient.ensureQueryData(opts))),
  pendingComponent: LoadingSpinner,
  component: HomePage
})

function HomePage() {
  const [recentlyUpdatedQ, upcomingQ, expiringQ, currentSeasonQ, scheduledQ] = useSuspenseQueries({
    queries: [...homeQueries()]
  })

  const recentlyUpdated = recentlyUpdatedQ.data.data
  const upcoming = upcomingQ.data.data
  const expiring = expiringQ.data.data
  const currentSeason = currentSeasonQ.data.data
  const scheduled = scheduledQ.data.data

  const byProvider = useMemo(() => {
    const map: Record<string, AnimeSchema[]> = {}
    for (const anime of currentSeason) {
      const list = map[anime.provider] ?? []
      list.push(anime)
      map[anime.provider] = list
    }
    for (const list of Object.values(map)) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
      }
    }
    return map
  }, [currentSeason])
  const currentYear = dayjs().year()
  const currentQuarter = getCurrentQuarter()
  const quarterLabel = ['冬', '春', '夏', '秋'][currentQuarter]

  const providerLabels: Record<string, string> = {
    amazon: 'Prime Video',
    hulu: 'Hulu',
    netflix: 'Netflix'
  }

  return (
    <PageTransition>
      <div className='space-y-10'>
        <AnimeCarousel
          title='最近更新されたアニメ'
          anime={recentlyUpdated}
          viewAllLink='/browse'
          badgeType='updatedAt'
        />
        <AnimeCarousel title='もうすぐ配信！' anime={upcoming} viewAllLink='/browse' badgeType='nextEpisodeDate' />
        <AnimeCarousel title='もうすぐ配信終了' anime={expiring} viewAllLink='/browse' badgeType='expiredAt' />
        <AnimeCarousel title={`${currentYear}年${quarterLabel}アニメ`} anime={currentSeason} viewAllLink='/browse' />
        <AnimeCarousel title='録画予約済み' anime={scheduled} viewAllLink='/browse' />
        {Object.entries(byProvider).map(([provider, anime]) => (
          <AnimeCarousel
            key={provider}
            title={providerLabels[provider] ?? provider}
            anime={anime}
            viewAllLink={`/browse?provider=${provider}`}
            showProvider={false}
          />
        ))}
      </div>
    </PageTransition>
  )
}
