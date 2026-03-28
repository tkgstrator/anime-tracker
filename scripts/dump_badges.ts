/**
 * 各プロバイダから badge 付きタイトルを取得して一覧出力するスクリプト
 */
import { AmazonProvider } from '../src/lib/providers/amazon/index'
import { HuluProvider } from '../src/lib/providers/hulu/index'
import type { Title } from '../src/schemas/providers/common.dto'

const categories = ['new_episode', 'recently_added', 'coming_soon', 'expiring'] as const

async function dumpProvider(provider: AmazonProvider | HuluProvider) {
  const results: Record<string, Title[]> = {}

  for (const category of categories) {
    console.error(`[${provider.name}] fetching ${category}...`)
    try {
      const titles = await provider.fetchTitleList({ category })
      results[category] = titles
      console.error(`[${provider.name}] ${category}: ${titles.length} titles`)
    } catch (e) {
      console.error(`[${provider.name}] ${category}: ERROR - ${e instanceof Error ? e.message : String(e)}`)
      results[category] = []
    }
  }

  return results
}

function formatTitle(t: Title): string {
  const parts = [t.contentId, t.title, t.entityType]
  if (t.badge) parts.push(`badge=${t.badge}`)
  if (t.expiring) parts.push(`expiring=${t.expiring.remainingHours}h`)
  if (t.nextEpisodeDate) parts.push(`nextEp=${t.nextEpisodeDate}`)
  return parts.join(' | ')
}

async function main() {
  const lines: string[] = []
  const now = new Date().toISOString()
  lines.push(`# Badge付きタイトル一覧`)
  lines.push(``)
  lines.push(`取得日時: ${now}`)
  lines.push(``)

  // Amazon
  console.error('=== Amazon ===')
  const amazon = new AmazonProvider()
  const amazonResults = await dumpProvider(amazon)

  lines.push(`## Amazon Prime Video`)
  lines.push(``)
  for (const category of categories) {
    const titles = amazonResults[category]
    lines.push(`### ${category} (${titles.length}件)`)
    lines.push(``)
    if (titles.length === 0) {
      lines.push(`_(該当なし)_`)
    } else {
      lines.push(`| # | contentId | タイトル | entityType | badge | expiring | nextEpisodeDate |`)
      lines.push(`|---|-----------|---------|------------|-------|----------|-----------------|`)
      for (const [i, t] of titles.entries()) {
        lines.push(
          `| ${i + 1} | ${t.contentId} | ${t.title} | ${t.entityType} | ${t.badge ?? '-'} | ${t.expiring ? `${t.expiring.remainingHours}h (S${t.expiring.season ?? '?'})` : '-'} | ${t.nextEpisodeDate ?? '-'} |`
        )
      }
    }
    lines.push(``)
  }

  // Hulu
  console.error('=== Hulu ===')
  const hulu = new HuluProvider()
  const huluResults = await dumpProvider(hulu)

  lines.push(`## Hulu`)
  lines.push(``)
  for (const category of categories) {
    const titles = huluResults[category]
    lines.push(`### ${category} (${titles.length}件)`)
    lines.push(``)
    if (titles.length === 0) {
      lines.push(`_(該当なし)_`)
    } else {
      lines.push(`| # | contentId | タイトル | entityType | badge | expiring | nextEpisodeDate |`)
      lines.push(`|---|-----------|---------|------------|-------|----------|-----------------|`)
      for (const [i, t] of titles.entries()) {
        lines.push(
          `| ${i + 1} | ${t.contentId} | ${t.title} | ${t.entityType} | ${t.badge ?? '-'} | ${t.expiring ? `${t.expiring.remainingHours}h` : '-'} | ${t.nextEpisodeDate ?? '-'} |`
        )
      }
    }
    lines.push(``)
  }

  const output = lines.join('\n')
  console.log(output)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
