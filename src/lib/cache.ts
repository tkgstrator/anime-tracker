import { logger } from './logger'

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
    } catch (e) {
      logger.error({ context: 'cache', action: 'put', key, error: e instanceof Error ? e.message : String(e) })
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.kv.get(key)
    } catch (e) {
      logger.error({ context: 'cache', action: 'get', key, error: e instanceof Error ? e.message : String(e) })
      return null
    }
  }
}
