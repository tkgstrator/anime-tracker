import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { AnimeCarousel } from '@/app/components/anime-carousel'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { PageTransition } from '@/app/components/page-transition'
import api from '@/app/lib/api'
import type { AnimeSchema } from '@/schemas/anime.dto'

function getCurrentQuarter(): number {
  const month = dayjs().month()
  if (month < 3) return 0
  if (month < 6) return 1
  if (month < 9) return 2
  return 3
}

type HomeData = {
  recentlyUpdated: AnimeSchema[]
  upcoming: AnimeSchema[]
  expiring: AnimeSchema[]
  currentSeason: AnimeSchema[]
  scheduled: AnimeSchema[]
  byProvider: Record<string, AnimeSchema[]>
}

export const Route = createFileRoute('/')({
  loader: async (): Promise<HomeData> => {
    const data = await api.getHomeData()

    const byProvider: Record<string, AnimeSchema[]> = {}
    for (const anime of data.currentSeason) {
      const list = byProvider[anime.provider] ?? []
      list.push(anime)
      byProvider[anime.provider] = list
    }
    for (const list of Object.values(byProvider)) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[list[i], list[j]] = [list[j], list[i]]
      }
    }

    return {
      recentlyUpdated: data.recentlyUpdated,
      upcoming: data.upcoming,
      expiring: data.expiring,
      currentSeason: data.currentSeason,
      scheduled: data.scheduled,
      byProvider
    }
  },
  staleTime: Number.POSITIVE_INFINITY,
  pendingComponent: LoadingSpinner,
  component: HomePage
})

function HomePage() {
  const { recentlyUpdated, upcoming, expiring, currentSeason, scheduled, byProvider } = Route.useLoaderData()
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
