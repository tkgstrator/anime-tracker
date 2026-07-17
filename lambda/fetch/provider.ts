/**
 * provider 名 → Provider 実装のマッピング。
 * ルート層はこの factory を経由することで具象クラスの import を持たずに済む。
 */
import { AbemaProvider } from '../../src/lib/providers/abema'
import { AmazonProvider } from '../../src/lib/providers/amazon'
import type { Provider } from '../../src/lib/providers/base'
import { CrunchyrollProvider } from '../../src/lib/providers/crunchyroll'
import { HuluProvider } from '../../src/lib/providers/hulu'

/**
 * provider 名から Provider 実装を返す。
 * 未知の provider が来た場合は fallback として AmazonProvider を返す
 * (歴史的経緯: 従来の behavior 維持のためデフォルトは Amazon)。
 */
export function getProvider(name: string): Provider {
  if (name === 'hulu') return new HuluProvider()
  if (name === 'crunchyroll') return new CrunchyrollProvider()
  if (name === 'abema') return new AbemaProvider()
  return new AmazonProvider()
}
