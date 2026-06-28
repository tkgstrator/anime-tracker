import { useMutation } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { Loader2, Send } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/app/components/ui/select'
import api from '@/app/lib/api'
import { providerLabel } from '@/app/lib/constants'
import type { NagisaEnqueueRequest, NagisaEnqueueResponse } from '@/schemas/nagisa.dto'

export const Route = createFileRoute('/admin/nagisa/')({
  component: NagisaJobEditorPage
})

type Provider = 'amazon' | 'crunchyroll' | 'hulu' | 'abema'
type Marketplace = 'jp' | 'us'
type Language = 'sub' | 'dub'

const PROVIDERS: Provider[] = ['amazon', 'crunchyroll', 'hulu', 'abema']
const MARKETPLACES: { value: Marketplace; label: string }[] = [
  { value: 'jp', label: '日本 (jp)' },
  { value: 'us', label: '米国 (us)' }
]
const LANGUAGES: { value: Language; label: string }[] = [
  { value: 'sub', label: '字幕 (sub)' },
  { value: 'dub', label: '吹替 (dub)' }
]

/** Select の value で「未指定」を表すセンチネル（空文字は base-ui で扱いづらい） */
const UNSET = '__unset__'

/** Select の trigger に表示するラベルを value から引く */
const providerValueLabel = (v: unknown) => (typeof v === 'string' ? (providerLabel[v] ?? v) : '')
const marketplaceValueLabel = (v: unknown) =>
  v === UNSET || v == null ? '未指定' : (MARKETPLACES.find((m) => m.value === v)?.label ?? String(v))
const languageValueLabel = (v: unknown) =>
  v === UNSET || v == null ? '未指定' : (LANGUAGES.find((l) => l.value === v)?.label ?? String(v))

function NagisaJobEditorPage() {
  const [provider, setProvider] = useState<Provider>('amazon')
  const [contentId, setContentId] = useState('')
  const [seasonNumberText, setSeasonNumberText] = useState('')
  const [episodesText, setEpisodesText] = useState('')
  const [marketplace, setMarketplace] = useState<Marketplace | typeof UNSET>(UNSET)
  const [language, setLanguage] = useState<Language | typeof UNSET>(UNSET)
  const [validationError, setValidationError] = useState<string | null>(null)

  const mutation = useMutation<NagisaEnqueueResponse, Error, NagisaEnqueueRequest>({
    mutationFn: (body) => api.enqueueNagisaJob(body)
  })

  const parseEpisodes = (): number[] | null | { error: string } => {
    const trimmed = episodesText.trim()
    if (!trimmed) {
      return null
    }
    const parts = trimmed.split(/[\s,]+/).filter((s) => s.length > 0)
    const nums: number[] = []
    for (const p of parts) {
      const n = Number(p)
      if (!Number.isInteger(n) || n <= 0) {
        return { error: `エピソード番号は正の整数で指定してください: "${p}"` }
      }
      nums.push(n)
    }
    return nums
  }

  const parseSeasonNumber = (): number | null | { error: string } => {
    const trimmed = seasonNumberText.trim()
    if (!trimmed) {
      return null
    }
    const n = Number(trimmed)
    if (!Number.isInteger(n) || n <= 0) {
      return { error: `season_number は正の整数で指定してください: "${trimmed}"` }
    }
    return n
  }

  const buildBody = (): NagisaEnqueueRequest | { error: string } => {
    const id = contentId.trim()
    if (!id) {
      return { error: 'content_id を入力してください' }
    }
    const seasonNumber = parseSeasonNumber()
    if (seasonNumber && typeof seasonNumber === 'object' && 'error' in seasonNumber) {
      return seasonNumber
    }
    const episodes = parseEpisodes()
    if (episodes && typeof episodes === 'object' && 'error' in episodes) {
      return episodes
    }
    // episodes だけ指定されていて season_number が無いのは Nagisa 側でどう扱われるか不明なので弾く
    if (Array.isArray(episodes) && episodes.length > 0 && typeof seasonNumber !== 'number') {
      return { error: 'episodes を指定する場合は season_number も指定してください' }
    }
    const seasons =
      typeof seasonNumber === 'number'
        ? [
            {
              season_number: seasonNumber,
              ...(Array.isArray(episodes) && episodes.length > 0 ? { episodes } : {})
            }
          ]
        : undefined
    return {
      provider,
      items: [{ content_id: id, ...(seasons ? { seasons } : {}) }],
      ...(marketplace !== UNSET ? { marketplace } : {}),
      ...(language !== UNSET ? { language } : {})
    }
  }

  const onSubmit = () => {
    const built = buildBody()
    if ('error' in built) {
      setValidationError(built.error)
      return
    }
    setValidationError(null)
    mutation.mutate(built)
  }

  const preview = (() => {
    const built = buildBody()
    if ('error' in built) {
      return null
    }
    return built
  })()

  return (
    <div className='space-y-6'>
      <div>
        <h1 className='text-2xl font-bold tracking-tight'>Nagisa ジョブ投入</h1>
        <p className='mt-1 text-sm text-muted-foreground'>
          バックエンド経由で Nagisa の <code className='rounded bg-muted px-1.5 py-0.5 text-xs'>/api/queues</code>{' '}
          に録画ジョブを直接投入する
        </p>
      </div>

      <div className='space-y-4 rounded-xl border border-border bg-card p-4'>
        <div className='space-y-1.5'>
          <Label htmlFor='provider'>provider</Label>
          <Select value={provider} onValueChange={(v) => setProvider(v as Provider)}>
            <SelectTrigger id='provider' className='w-full'>
              <SelectValue>{providerValueLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PROVIDERS.map((p) => (
                <SelectItem key={p} value={p}>
                  {providerLabel[p] ?? p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className='space-y-1.5'>
          <Label htmlFor='contentId'>content_id</Label>
          <Input
            id='contentId'
            placeholder='例: B0DXV9MP4Y / lycoris-recoil など'
            value={contentId}
            onChange={(e) => setContentId(e.target.value)}
          />
        </div>

        <div className='grid gap-4 sm:grid-cols-[1fr_2fr]'>
          <div className='space-y-1.5'>
            <Label htmlFor='seasonNumber'>season_number（任意・空欄で全シーズン）</Label>
            <Input
              id='seasonNumber'
              placeholder='例: 1'
              value={seasonNumberText}
              onChange={(e) => setSeasonNumberText(e.target.value)}
            />
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='episodes'>episodes（任意・空欄で全話）</Label>
            <Input
              id='episodes'
              placeholder='例: 1, 2, 3'
              value={episodesText}
              onChange={(e) => setEpisodesText(e.target.value)}
            />
            <p className='text-xs text-muted-foreground'>カンマ・スペース・改行区切り。season_number と併用。</p>
          </div>
        </div>

        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='space-y-1.5'>
            <Label htmlFor='marketplace'>marketplace（任意）</Label>
            <Select value={marketplace} onValueChange={(v) => setMarketplace(v as Marketplace | typeof UNSET)}>
              <SelectTrigger id='marketplace' className='w-full'>
                <SelectValue>{marketplaceValueLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>未指定</SelectItem>
                {MARKETPLACES.map((m) => (
                  <SelectItem key={m.value} value={m.value}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className='space-y-1.5'>
            <Label htmlFor='language'>language（任意）</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as Language | typeof UNSET)}>
              <SelectTrigger id='language' className='w-full'>
                <SelectValue>{languageValueLabel}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={UNSET}>未指定</SelectItem>
                {LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {l.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {validationError && <p className='text-sm text-destructive'>{validationError}</p>}

        <div className='flex items-center gap-3'>
          <Button onClick={onSubmit} disabled={mutation.isPending}>
            {mutation.isPending ? <Loader2 className='animate-spin' /> : <Send />}
            投入
          </Button>
          {mutation.isPending && <span className='text-sm text-muted-foreground'>送信中…</span>}
        </div>
      </div>

      {preview && (
        <div className='space-y-1.5'>
          <p className='text-sm font-medium leading-none'>送信内容プレビュー</p>
          <pre className='overflow-x-auto rounded-xl border border-border bg-muted p-3 font-mono text-xs'>
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      )}

      {mutation.isError && (
        <div className='space-y-1.5'>
          <p className='text-sm font-medium leading-none'>エラー</p>
          <pre className='overflow-x-auto rounded-xl border border-destructive/50 bg-destructive/10 p-3 font-mono text-xs text-destructive'>
            {mutation.error.message}
          </pre>
        </div>
      )}

      {mutation.isSuccess && (
        <div className='space-y-3'>
          <div className='text-sm text-muted-foreground'>{mutation.data.count} 件のジョブを投入しました</div>
          {mutation.data.jobs.map((job) => (
            <div key={job.job_id} className='space-y-1.5'>
              <p className='text-sm font-medium leading-none'>
                {job.name} ({job.status}) — {job.job_id}
              </p>
              {job.preview && (
                <div className='rounded-xl border border-border bg-card p-3 text-sm'>
                  <div className='font-medium'>{job.preview.title}</div>
                  {job.preview.title_en && <div className='text-xs text-muted-foreground'>{job.preview.title_en}</div>}
                  <div className='mt-2 text-xs text-muted-foreground'>
                    {job.preview.content_type} ・ {job.preview.selected_episodes} / {job.preview.total_episodes} 話 ・{' '}
                    {job.preview.marketplace}
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className='space-y-1.5'>
            <p className='text-sm font-medium leading-none'>レスポンス全体</p>
            <pre className='overflow-x-auto rounded-xl border border-border bg-muted p-3 font-mono text-xs'>
              {JSON.stringify(mutation.data, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
