import type { Title, TitleInfo } from '../../schemas/providers/common.dto'
import type { CacheManager } from '../cache'

export interface FetchTitleListOptions {
  /** 取得カテゴリ。未指定時は全タイトル */
  category?: 'new_episode' | 'coming_soon' | 'expiring'
}

/**
 * 動画配信プロバイダの基底クラス。
 *
 * 各プロバイダ (Amazon, Hulu, Netflix 等) はこのクラスを継承し、
 * タイトル一覧取得とエピソード一覧取得の 2 つのメソッドを実装する。
 */
export abstract class Provider {
  /** プロバイダの識別名 (例: "amazon", "hulu") */
  abstract readonly name: string

  /** キャッシュマネージャ (生レスポンスの保存等に使用) */
  cache: CacheManager | null = null

  abstract fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]>

  abstract fetchTitleInfo(contentId: string): Promise<TitleInfo>
}
