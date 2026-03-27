import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, Link } from '@tanstack/react-router'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { SlideUpTransition } from '@/app/components/page-transition'
import api from '@/app/lib/api'
import { queryKeys } from '@/app/lib/query-keys'
import { animeDetailQueryOptions } from '@/app/lib/query-options'
import { AnimeHero } from './-components/anime-hero'
import { EpisodeGrid } from './-components/episode-grid'

export const Route = createFileRoute('/anime/$id/')({
  loader: ({ params, context: { queryClient } }) => queryClient.ensureQueryData(animeDetailQueryOptions(params.id)),
  pendingComponent: LoadingSpinner,
  component: AnimeDetailPage
})

function AnimeDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const { data: anime } = useSuspenseQuery(animeDetailQueryOptions(id))

  const invalidateRelated = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.anime.detail(id) })
    queryClient.invalidateQueries({ queryKey: queryKeys.anime.all })
  }

  const updateAnimeMutation = useMutation({
    mutationFn: (body: { scheduled?: boolean; recorded?: boolean }) => api.updateAnime(body, { params: { id } }),
    onSuccess: invalidateRelated
  })

  const recordAnimeMutation = useMutation({
    mutationFn: () => api.recordAnime(undefined, { params: { id } }),
    onSuccess: () => toast.success('録画リクエストを送信しました'),
    onError: () => toast.error('録画リクエストに失敗しました')
  })

  const updating = updateAnimeMutation.isPending || recordAnimeMutation.isPending

  const toggleScheduled = () => {
    updateAnimeMutation.mutate({ scheduled: !anime.scheduled })
  }

  const toggleRecorded = async () => {
    if (!anime.recorded) {
      await recordAnimeMutation.mutateAsync()
    }
    updateAnimeMutation.mutate({ recorded: !anime.recorded })
  }

  const totalEpisodes = anime.seasons.reduce((sum, s) => sum + s.episodes.length, 0)
  const totalDuration = anime.seasons.reduce((sum, s) => sum + s.episodes.reduce((es, e) => es + e.duration, 0), 0)

  return (
    <SlideUpTransition>
      <div className='space-y-8'>
        <div>
          <Link to='/' className='text-sm text-muted-foreground hover:text-foreground'>
            ← 一覧に戻る
          </Link>
        </div>

        <AnimeHero
          anime={anime}
          totalEpisodes={totalEpisodes}
          totalDuration={totalDuration}
          updating={updating}
          onToggleScheduled={toggleScheduled}
          onToggleRecorded={toggleRecorded}
        />

        <EpisodeGrid seasons={anime.seasons} provider={anime.provider} />
      </div>
    </SlideUpTransition>
  )
}
