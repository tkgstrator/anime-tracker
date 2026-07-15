import type { Title, TitleInfo } from '../../schemas/providers/common.dto'
import { getAppLogger } from '../logger'

export interface FetchTitleListOptions {
  /** 取得カテゴリ。未指定時は全タイトル (catalog) */
  category?: 'new_episode' | 'coming_soon' | 'expiring' | 'catalog'
}

/**
 * 動画配信プロバイダの基底クラス。
 *
 * subclass は最低限 `name` と `fetchCatalog()` / `fetchTitleInfo()` を実装する。
 * `fetchNewEpisode()` / `fetchComingSoon()` / `fetchExpiring()` は default では
 * 空配列 (= 未対応) を返すので、対応する category だけ override すればよい。
 */
export abstract class Provider {
  /** プロバイダの識別名 (例: "amazon", "hulu") */
  abstract readonly name: string

  /** logger は category dispatch ごとに getAppLogger(this.name) を引く */
  protected get logger() {
    return getAppLogger(this.name)
  }

  /** category 分岐の dispatch。subclass は各 fetchXxx を override する */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]> {
    const category = options?.category
    if (category === 'new_episode') return this.fetchNewEpisode()
    if (category === 'coming_soon') return this.fetchComingSoon()
    if (category === 'expiring') return this.fetchExpiring()
    return this.fetchCatalog()
  }

  protected fetchNewEpisode(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-skip', mode: 'new_episode' })
    return Promise.resolve([])
  }

  protected fetchComingSoon(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-skip', mode: 'coming_soon' })
    return Promise.resolve([])
  }

  protected fetchExpiring(): Promise<Title[]> {
    this.logger.info({ action: 'fetch-title-list-skip', mode: 'expiring' })
    return Promise.resolve([])
  }

  protected abstract fetchCatalog(): Promise<Title[]>

  abstract fetchTitleInfo(contentId: string): Promise<TitleInfo>

  /**
   * カーソル駆動のページネーションヘルパー。
   * `fetchPage(cursor)` が `{ items, next }` を返し、`next === null` で打ち切る。
   */
  protected async paginate<T, C>(opts: {
    initial: C
    fetchPage: (cursor: C) => Promise<{ items: T[]; next: C | null }>
  }): Promise<T[]> {
    const step = async (cursor: C, acc: T[]): Promise<T[]> => {
      const { items, next } = await opts.fetchPage(cursor)
      const nextAcc = [...acc, ...items]
      return next === null ? nextAcc : step(next, nextAcc)
    }
    return step(opts.initial, [])
  }

  /** key で重複排除する (最初に出現したものを残す) */
  protected dedupeBy<T>(items: T[], key: (t: T) => string): T[] {
    const seen = new Set<string>()
    const out: T[] = []
    for (const item of items) {
      const k = key(item)
      if (seen.has(k)) continue
      seen.add(k)
      out.push(item)
    }
    return out
  }
}
