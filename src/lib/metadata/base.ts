import type { TitleMetadata } from '../../schemas/provider.dto'

/**
 * メタデータプロバイダの基底クラス。
 *
 * AniList, TMDB 等の外部メタデータソースはこのクラスを継承し、
 * タイトル文字列から TitleMetadata を返す identify メソッドを実装する。
 */
export abstract class MetadataAdapter {
  abstract readonly name: string

  /**
   * タイトル文字列からアニメを識別し、メタデータを返す。
   * 見つからない場合は undefined。
   */
  abstract identify(title: string): Promise<TitleMetadata | undefined>
}
