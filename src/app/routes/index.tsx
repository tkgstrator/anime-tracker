import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { AnimeCarousel } from '@/app/components/anime-carousel'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { PageTransition } from '@/app/components/page-transition'
import api from '@/app/lib/api'
import type { AnimeSchema } from '@/schemas/anime.dto'

function getCurrentQuarter(): number {
  const month = dayjs().month() // 0-indexed
  if (month < 3) return 0 // 冬 (1-3月)
  if (month < 6) return 1 // 春 (4-6月)
  if (month < 9) return 2 // 夏 (7-9月)
  return 3 // 秋 (10-12月)
}

type HomeData = {
  recentlyUpdated: AnimeSchema[]
  upcoming: AnimeSchema[]
  currentSeason: AnimeSchema[]
  scheduled: AnimeSchema[]
  byProvider: Record<string, AnimeSchema[]>
}

export const Route = createFileRoute('/')({
  loader: async (): Promise<HomeData> => {
    const currentYear = dayjs().year()
    const currentQuarter = getCurrentQuarter()

    const [recentlyUpdatedRes, upcomingRes, currentSeasonRes, scheduledRes] = await Promise.all([
      api.getAnimeList({ queries: { recentlyUpdated: true, limit: 20, sort: 'year', order: 'desc' } }),
      api.getAnimeList({ queries: { upcoming: true, limit: 20, sort: 'title', order: 'asc' } }),
      api.getAnimeList({
        queries: { year: currentYear, quarter: currentQuarter, limit: 20, sort: 'title', order: 'asc' }
      }),
      api.getAnimeList({ queries: { scheduled: true, limit: 20, sort: 'title', order: 'asc' } })
    ])

    const byProvider: Record<string, AnimeSchema[]> = {}
    for (const anime of currentSeasonRes.data) {
      const list = byProvider[anime.provider] ?? []
      list.push(anime)
      byProvider[anime.provider] = list
    }

    return {
      recentlyUpdated: recentlyUpdatedRes.data,
      upcoming: upcomingRes.data,
      currentSeason: currentSeasonRes.data,
      scheduled: scheduledRes.data,
      byProvider
    }
  },
  pendingComponent: LoadingSpinner,
  component: HomePage
})

function HomePage() {
  const { recentlyUpdated, upcoming, currentSeason, scheduled, byProvider } = Route.useLoaderData()
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
        <AnimeCarousel title={`${currentYear}年${quarterLabel}アニメ`} anime={currentSeason} viewAllLink='/browse' />
        <AnimeCarousel title='録画予約済み' anime={scheduled} viewAllLink='/browse' />
        {Object.entries(byProvider).map(([provider, anime]) => (
          <AnimeCarousel
            key={provider}
            title={providerLabels[provider] ?? provider}
            anime={anime}
            viewAllLink='/browse'
          />
        ))}
      </div>
    </PageTransition>
  )
}
