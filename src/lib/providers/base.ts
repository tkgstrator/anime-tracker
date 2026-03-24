import type { Title, TitleDetail, TitleDetail } from '../../schemas/provider.dto'
import type { MetadataAdapter } from '../metadata'

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

  constructor(protected readonly adapter?: MetadataAdapter) {}

  /**
   * プロバイダからアニメタイトル一覧を取得する。
   * @param options - 取得オプション
   * @returns タイトル一覧
   */
  abstract fetchTitleList(options?: FetchTitleListOptions): Promise<Title[]>

  /**
   * コンテンツ ID からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * @param contentId - プロバイダ固有のコンテンツ ID
   * @returns タイトル詳細情報
   */
  abstract fetchEpisodeList(contentId: string): Promise<TitleDetail>

  /**
   * タイトル詳細を取得する。アダプタがあればメタデータの識別結果も付与する。
   * @param contentId - プロバイダ固有のコンテンツ ID
   * @returns タイトル詳細
   */
  async fetchTitle(contentId: string): Promise<TitleDetail> {
    const detail = await this.fetchEpisodeList(contentId)
    const identified = this.adapter
      ? await this.adapter.identify(detail.title).catch(() => undefined)
      : undefined
    return {
      ...detail,
      title: identified?.nativeTitle ?? detail.title,
      status: identified?.status,
      year: identified?.year,
      quarter: identified?.quarter,
      identified
    }
  }
}
