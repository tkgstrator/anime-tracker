import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { toast } from 'sonner'
import { LoadingSpinner } from '@/app/components/loading-spinner'
import { SlideUpTransition } from '@/app/components/page-transition'
import api from '@/app/lib/api'
import type { AnimeWithSeasonsSchema } from '@/schemas/anime.dto'
import { AnimeHero } from './-components/anime-hero'
import { EpisodeGrid } from './-components/episode-grid'

export const Route = createFileRoute('/anime/$id/')({
  loader: ({ params }) => api.getAnime({ params: { id: params.id } }),
  pendingComponent: LoadingSpinner,
  component: AnimeDetailPage
})

function AnimeDetailPage() {
  const loaderData = Route.useLoaderData()
  const { id } = Route.useParams()
  const [anime, setAnime] = useState<AnimeWithSeasonsSchema>(loaderData)
  const [updating, setUpdating] = useState(false)

  const toggleScheduled = async () => {
    setUpdating(true)
    try {
      const result = await api.updateAnime({ scheduled: !anime.scheduled }, { params: { id } })
      setAnime((prev) => ({ ...prev, scheduled: result.scheduled }))
    } catch (e) {
      console.error('Failed to update scheduled', e)
    } finally {
      setUpdating(false)
    }
  }

  const toggleRecorded = async () => {
    setUpdating(true)
    try {
      if (!anime.recorded) {
        await api.recordAnime(undefined, { params: { id } })
        toast.success('録画リクエストを送信しました')
      }
      const result = await api.updateAnime({ recorded: !anime.recorded }, { params: { id } })
      setAnime((prev) => ({ ...prev, recorded: result.recorded }))
    } catch (e) {
      console.error('Failed to update recorded', e)
      toast.error('録画リクエストに失敗しました')
    } finally {
      setUpdating(false)
    }
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
