import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '../generated/prisma/client.ts'

// Cloudflare Workers reuse the same isolate (and the same D1 binding object)
// across requests, so keying the PrismaClient on the binding lets subsequent
// requests skip PrismaClient / PrismaD1 adapter construction (~200ms) and
// keeps the adapter's prepared-statement cache warm. Entries auto-clear if
// the binding is ever GC'd.
const clientCache = new WeakMap<D1Database, PrismaClient>()

export function createPrismaClient(db: D1Database): PrismaClient {
  const cached = clientCache.get(db)
  if (cached) return cached
  const adapter = new PrismaD1(db)
  const client = new PrismaClient({ adapter })
  clientCache.set(db, client)
  return client
}

/** D1 の一過性エラー（接続断など）か。制約違反等は対象外。 */
function isTransientD1Error(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e)
  return msg.includes('Network connection lost') || msg.includes('Cannot perform I/O')
}

/**
 * D1 の一過性エラー（`D1_ERROR: Network connection lost` 等）を指数バックオフで再試行する。
 * 制約違反など非一過性のエラーは即座に rethrow する。
 */
export async function withD1Retry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn()
    } catch (e) {
      if (attempt >= retries || !isTransientD1Error(e)) throw e
      await new Promise((r) => setTimeout(r, Math.min(150 * 2 ** attempt, 2000)))
    }
  }
}
