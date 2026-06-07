import { useSuspenseQueries, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import dayjs from 'dayjs'
import { useMemo } from 'react'
import { AnimeCarousel } from '@/app/components/anime-carousel'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { ScheduledUpdatesList } from '@/app/components/scheduled-updates-list'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/app/components/ui/tabs'
import { providerLabel } from '@/app/lib/constants'
import { animeListQueryOptions, badgedAnimeQueryOptions } from '@/app/lib/query-options'
import type { AnimeSchema } from '@/schemas/anime.dto'

const SCHEDULED_PREVIEW_LIMIT = 6

function getCurrentQuarter(): number {
  const month = dayjs().month()
  if (month < 3) return 0
  if (month < 6) return 1
  if (month < 9) return 2
  return 3
}

const currentSeasonQueryOptions = () => {
  const currentYear = dayjs().year()
  const currentQuarter = getCurrentQuarter()
  return animeListQueryOptions({
    year: currentYear,
    quarter: currentQuarter,
    limit: 100,
    sort: 'title',
    order: 'asc'
  })
}

const scheduledUpdatesQueryOptions = () =>
  animeListQueryOptions({
    scheduled: true,
    limit: SCHEDULED_PREVIEW_LIMIT,
    page: 1,
    sort: 'updatedAt',
    order: 'desc'
  })

export const Route = createFileRoute('/')({
  loader: ({ context: { queryClient } }) =>
    Promise.all([
      queryClient.ensureQueryData(badgedAnimeQueryOptions()),
      queryClient.ensureQueryData(currentSeasonQueryOptions()),
      queryClient.ensureQueryData(scheduledUpdatesQueryOptions())
    ]),
  pendingComponent: LoadingSpinner,
  component: HomePage
})

function HomePage() {
  const { data: badged } = useSuspenseQuery(badgedAnimeQueryOptions())
  const [currentSeasonQ, scheduledQ] = useSuspenseQueries({
    queries: [currentSeasonQueryOptions(), scheduledUpdatesQueryOptions()]
  })

  const currentSeason = currentSeasonQ.data.data
  const scheduledUpdates = scheduledQ.data.data

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
  const seasonTitle = `${currentYear}年${quarterLabel}アニメ`

  const emptyState = (label: string) => <p className='py-10 text-center text-sm text-muted-foreground'>{label}</p>
  const activeTabClass =
    'data-active:bg-foreground data-active:text-background! dark:data-active:border-foreground dark:data-active:bg-foreground dark:data-active:text-background!'

  return (
    <div className='min-w-0 space-y-6'>
      <div className='grid gap-6 lg:grid-cols-3'>
        <div className='min-w-0 lg:col-span-2'>
          <AnimeCarousel
            title='新着エピソード'
            anime={badged.NEW_EPISODE}
            viewAllLink='/browse?badge=NEW_EPISODE'
            badgeType='nextEpisodeDate'
          />
        </div>
        <ScheduledUpdatesList anime={scheduledUpdates} />
      </div>

      <Tabs defaultValue='season' className='min-w-0 gap-3'>
        <div className='-mx-2 overflow-x-auto px-2'>
          <TabsList className='w-max'>
            <TabsTrigger value='season' className={activeTabClass}>
              {seasonTitle}
            </TabsTrigger>
            <TabsTrigger value='added' className={activeTabClass}>
              新着追加
            </TabsTrigger>
            <TabsTrigger value='coming' className={activeTabClass}>
              もうすぐ配信
            </TabsTrigger>
            <TabsTrigger value='expiring' className={activeTabClass}>
              配信終了予定
            </TabsTrigger>
            <TabsTrigger value='provider' className={activeTabClass}>
              配信元から探す
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value='season' className='min-w-0'>
          {currentSeason.length === 0 ? (
            emptyState('このシーズンのアニメはまだありません')
          ) : (
            <AnimeCarousel title={seasonTitle} anime={currentSeason} viewAllLink='/browse' />
          )}
        </TabsContent>
        <TabsContent value='added' className='min-w-0'>
          {badged.RECENTLY_ADDED.length === 0 ? (
            emptyState('最近追加されたアニメはありません')
          ) : (
            <AnimeCarousel
              title='最近追加されたアニメ'
              anime={badged.RECENTLY_ADDED}
              viewAllLink='/browse?badge=RECENTLY_ADDED'
            />
          )}
        </TabsContent>
        <TabsContent value='coming' className='min-w-0'>
          {badged.COMING_SOON.length === 0 ? (
            emptyState('まもなく配信予定のアニメはありません')
          ) : (
            <AnimeCarousel
              title='もうすぐ配信'
              anime={badged.COMING_SOON}
              viewAllLink='/browse?badge=COMING_SOON'
              badgeType='nextEpisodeDate'
            />
          )}
        </TabsContent>
        <TabsContent value='expiring' className='min-w-0'>
          {badged.EXPIRING.length === 0 ? (
            emptyState('まもなく配信終了のアニメはありません')
          ) : (
            <AnimeCarousel
              title='もうすぐ配信終了'
              anime={badged.EXPIRING}
              viewAllLink='/browse?badge=EXPIRING'
              badgeType='expiredAt'
            />
          )}
        </TabsContent>
        <TabsContent value='provider' className='min-w-0'>
          {byProvider.size === 0 ? (
            <p className='py-8 text-center text-sm text-muted-foreground'>このシーズンの配信元別データはありません</p>
          ) : (
            <div className='space-y-6'>
              {Array.from(byProvider.entries()).map(([provider, anime]) => {
                const providerName = providerLabel[provider]
                const heading = providerName ? providerName : provider
                return (
                  <AnimeCarousel
                    key={provider}
                    title={heading}
                    anime={anime}
                    viewAllLink={`/browse?provider=${provider}`}
                    showProvider={false}
                  />
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
