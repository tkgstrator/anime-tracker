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
    animeListQueryOptions({ year: currentYear, quarter: currentQuarter, limit: 100, sort: 'title', order: 'asc' }),
    animeListQueryOptions({ scheduled: true, limit: 100, sort: 'title', order: 'asc' })
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
  const [currentSeasonQ, scheduledQ] = useSuspenseQueries({
    queries: [...homeQueries()]
  })

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

  return (
    <div className='space-y-10'>
      <AnimeCarousel
        title='新着エピソード'
        anime={badged.NEW_EPISODE}
        viewAllLink='/browse'
        badgeType='nextEpisodeDate'
      />
      <AnimeCarousel title='最近追加されたアニメ' anime={badged.RECENTLY_ADDED} viewAllLink='/browse' />
      <AnimeCarousel
        title='もうすぐ配信'
        anime={badged.COMING_SOON}
        viewAllLink='/browse'
        badgeType='nextEpisodeDate'
      />
      <AnimeCarousel title='もうすぐ配信終了' anime={badged.EXPIRING} viewAllLink='/browse' badgeType='expiredAt' />
      <AnimeCarousel title={`${currentYear}年${quarterLabel}アニメ`} anime={currentSeason} viewAllLink='/browse' />
      <AnimeCarousel title='録画予約済み' anime={scheduled} viewAllLink='/browse' />
      {Object.entries(byProvider).map(([provider, anime]) => (
        <AnimeCarousel
          key={provider}
          title={providerLabel[provider] ?? provider}
          anime={anime}
          viewAllLink={`/browse?provider=${provider}`}
          showProvider={false}
        />
      ))}
    </div>
  )
}
