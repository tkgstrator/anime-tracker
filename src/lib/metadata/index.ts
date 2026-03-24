import type { TitleMetadata } from '../../schemas/provider.dto'
import type { MetadataAdapter } from './base'

/**
 * 複数のメタデータプロバイダに問い合わせ、結果をマージして返す。
 * 先に見つかった値を優先する（providers配列の順序）。
 * 全プロバイダで見つからない場合は undefined。
 */
export async function identifyTitle(title: string, providers: MetadataAdapter[]): Promise<TitleMetadata | undefined> {
  const results = await Promise.all(providers.map((p) => p.identify(title).catch(() => undefined)))

  const merged: Partial<TitleMetadata> = {}
  for (const result of results) {
    if (!result) continue
    merged.tmdbId ??= result.tmdbId
    merged.aniListId ??= result.aniListId
    merged.title ??= result.title
    merged.status ??= result.status
    merged.year ??= result.year
    merged.quarter ??= result.quarter
  }

  if (Object.keys(merged).length === 0) return undefined
  return merged as TitleMetadata
}

export { AniListAdapter } from './anilist'
export { MetadataAdapter } from './base'
export { TmdbAdapter } from './tmdb'
