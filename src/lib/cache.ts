import { getAppLogger } from './logger'

const logger = getAppLogger('cache')

/**
 * KV を利用した汎用キャッシュマネージャ。
 *
 * Provider 等に注入して生レスポンスの保存・取得に使う。
 */
export class CacheManager {
  constructor(private readonly kv: KVNamespace) {}

  async put(key: string, value: string, ttl = 86400): Promise<void> {
    try {
      await this.kv.put(key, value, { expirationTtl: ttl })
      logger.debug({ action: 'put', key, ttl, size: value.length })
    } catch (e) {
      logger.error({ action: 'put', key, error: e instanceof Error ? e.message : String(e) })
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      const value = await this.kv.get(key)
      logger.debug({ action: 'get', key, hit: value !== null })
      return value
    } catch (e) {
      logger.error({ action: 'get', key, error: e instanceof Error ? e.message : String(e) })
      return null
    }
  }
}
