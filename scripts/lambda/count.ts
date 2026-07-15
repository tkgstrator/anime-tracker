/**
 * 各 provider × category について
 *   - lambda が返したエントリ数
 *   - そのうち AniList で識別できた / できなかった件数
 * を集計する。Crunchyroll は VPN 必須なのでスキップ。
 *
 * Usage: bun scripts/lambda/count.ts
 */
import { handler } from '../../lambda/fetch/index'

type Endpoint =
  | { kind: 'title_list'; provider: string; category: 'new_episode' | 'coming_soon' }
  | { kind: 'expiring'; provider: string }

const JOBS: Endpoint[] = [
  { kind: 'title_list', provider: 'amazon', category: 'new_episode' },
  { kind: 'expiring', provider: 'amazon' },
  { kind: 'title_list', provider: 'hulu', category: 'new_episode' },
  { kind: 'title_list', provider: 'hulu', category: 'coming_soon' },
  { kind: 'expiring', provider: 'hulu' },
  { kind: 'title_list', provider: 'abema', category: 'new_episode' }
]

type Row = {
  label: string
  fetched: number
  identified: number
  unidentified: number
  ids: string[]
}

async function invoke(rawPath: string, body: object): Promise<unknown> {
  const res = await handler({ rawPath, body: JSON.stringify(body) })
  if (res.statusCode !== 200) {
    throw new Error(`${rawPath} failed: status=${res.statusCode} body=${res.body.slice(0, 500)}`)
  }
  return JSON.parse(res.body)
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

async function identifyAll(titles: string[]): Promise<{ identified: number; unidentified: number }> {
  if (titles.length === 0) return { identified: 0, unidentified: 0 }
  // /identify は AniList のレート制限に当たるので分割して投げる
  const batches = chunk(titles, 10)
  let identified = 0
  let unidentified = 0
  for (const batch of batches) {
    const res = (await invoke('/identify', { titles: batch })) as { results: ({ aniListId: number } | null)[] }
    for (const r of res.results) {
      if (r) identified++
      else unidentified++
    }
  }
  return { identified, unidentified }
}

const rows: Row[] = []

for (const job of JOBS) {
  const label = job.kind === 'title_list' ? `${job.provider}/${job.category}` : `${job.provider}/expiring`
  console.log(`\n=== ${label} ===`)
  try {
    if (job.kind === 'title_list') {
      const res = (await invoke('/title_list', { provider: job.provider, category: job.category })) as {
        entries: { contentId: string; title: string }[]
      }
      const titles = res.entries.map((e) => e.title).filter((t) => t.length > 0)
      const { identified, unidentified } = await identifyAll(titles)
      const row: Row = {
        label,
        fetched: res.entries.length,
        identified,
        unidentified,
        ids: res.entries.map((e) => e.contentId)
      }
      rows.push(row)
      console.log(`fetched=${row.fetched} identified=${row.identified} unidentified=${row.unidentified}`)
    } else {
      // expiring は title を返さないので /title_list (catalog) と合流しない限り識別できない。
      // ここでは件数のみ。
      const res = (await invoke('/expiring', { provider: job.provider })) as { entries: unknown[] }
      const row: Row = {
        label,
        fetched: res.entries.length,
        identified: 0,
        unidentified: 0,
        ids: []
      }
      rows.push(row)
      console.log(`fetched=${row.fetched}  (expiring は title を返さないため /identify はスキップ)`)
    }
  } catch (e) {
    console.error(`FAILED ${label}:`, e instanceof Error ? e.message : e)
    rows.push({ label, fetched: -1, identified: -1, unidentified: -1, ids: [] })
  }
}

console.log('\n===SUMMARY===')
console.log(['label'.padEnd(28), 'fetched'.padStart(8), 'identified'.padStart(11), 'unidentified'.padStart(13)].join('  '))
for (const r of rows) {
  console.log([
    r.label.padEnd(28),
    String(r.fetched).padStart(8),
    String(r.identified).padStart(11),
    String(r.unidentified).padStart(13)
  ].join('  '))
}
