import type { Title, TitleInfo } from '../../schemas/providers/common.dto'

export interface FetchTitleListOptions {
  /** true の場合、新エピソードが追加されたタイトルのみ返す */
  newEpisodesOnly?: boolean
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

  abstract fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]>

  abstract fetchTitleInfo(contentId: string): Promise<TitleInfo>
}
