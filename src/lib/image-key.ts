import { v5 as uuidv5 } from 'uuid'

/** プロジェクト共通の UUIDv5 namespace */
const NAMESPACE = uuidv5('animetracker', uuidv5.DNS)

/**
 * 画像の元URLから R2 のオブジェクトキーを生成する。
 * 同じ URL からは常に同じキーが生成される。拡張子は webp 固定。
 */
export function imageKey(imageUrl: string): string {
  return `${uuidv5(imageUrl, NAMESPACE)}.webp`
}
