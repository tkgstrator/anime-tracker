import type { Title, TitleInfo } from '../../schemas/providers/common.dto'
import type { CacheManager } from '../cache'

export interface FetchTitleListOptions {
  /** true の場合、新エピソードが追加されたタイトルのみ返す */
  newEpisodesOnly?: boolean
  /** true の場合、配信終了間近タイトルのみ返す */
  expiringOnly?: boolean
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
