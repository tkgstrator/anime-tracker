import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { AnimeCarousel } from '@/app/components/anime-carousel'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { PageTransition } from '@/app/components/page-transition'
import { homeQueryOptions } from '@/app/lib/query-options'
import type { AnimeSchema } from '@/schemas/anime.dto'

function getCurrentQuarter(): number {
  const month = dayjs().month()
  if (month < 3) return 0
  if (month < 6) return 1
  if (month < 9) return 2
  return 3
}

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(homeQueryOptions()),
  pendingComponent: LoadingSpinner,
  component: HomePage
})

function HomePage() {
  const { data } = useSuspenseQuery(homeQueryOptions())
  const { recentlyUpdated, upcoming, expiring, currentSeason, scheduled } = data

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
