import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '../generated/prisma/client.ts'

export function createPrismaClient(db: D1Database): PrismaClient {
  const adapter = new PrismaD1(db)
  return new PrismaClient({ adapter })
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
