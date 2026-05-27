import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute, useRouter } from '@tanstack/react-router'
import { ChevronLeft } from 'lucide-react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { Button } from '@/app/components/ui/button'
import api from '@/app/lib/api'
import { queryKeys } from '@/app/lib/query-keys'
import { animeDetailQueryOptions } from '@/app/lib/query-options'
import { AnimeHero } from './-components/anime-hero'
import { EpisodeGrid } from './-components/episode-grid'

function getApiErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === 'object') {
    const response = (error as { response?: { data?: unknown } }).response
    const data = response?.data
    if (data && typeof data === 'object') {
      const message = (data as { error?: unknown }).error
      if (typeof message === 'string' && message.trim().length > 0) return message
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) return error.message
  return fallback
}

export const Route = createFileRoute('/anime/$id/')({
  loader: ({ params, context: { queryClient } }) => queryClient.ensureQueryData(animeDetailQueryOptions(params.id)),
  pendingComponent: LoadingSpinner,
  component: AnimeDetailPage
})

function AnimeDetailPage() {
  const { id } = Route.useParams()
  const queryClient = useQueryClient()
  const router = useRouter()
  const { data: anime } = useSuspenseQuery(animeDetailQueryOptions(id))

  const goBack = () => {
    if (window.history.length > 1) router.history.back()
    else router.navigate({ to: '/' })
  }

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
    onSuccess: (data) => {
      if (data.count === 0) {
        toast.info('録画対象のエピソードがありません')
        return
      }
      toast.success('録画を開始しました')
    },
    onError: () => toast.error('録画リクエストに失敗しました')
  })

  const refreshAnimeMutation = useMutation({
    mutationFn: () => api.refreshAnime(undefined, { params: { id } }),
    onSuccess: () => {
      toast.success('タイトル情報を更新しました')
      invalidateRelated()
    },
    onError: (error) => toast.error(getApiErrorMessage(error, '情報の更新に失敗しました'))
  })

  const updating = updateAnimeMutation.isPending || recordAnimeMutation.isPending || refreshAnimeMutation.isPending

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
    <div className='space-y-8'>
      <div>
        <Button type='button' size='sm' variant='ghost' onClick={goBack} className='-ml-2 text-muted-foreground'>
          <ChevronLeft />
          戻る
        </Button>
      </div>

      <AnimeHero
        anime={anime}
        totalEpisodes={totalEpisodes}
        totalDuration={totalDuration}
        updating={updating}
        refreshing={refreshAnimeMutation.isPending}
        onToggleScheduled={toggleScheduled}
        onToggleRecorded={toggleRecorded}
        onRefresh={() => refreshAnimeMutation.mutate()}
      />

      <EpisodeGrid seasons={anime.seasons} provider={anime.provider} />
    </div>
  )
}
