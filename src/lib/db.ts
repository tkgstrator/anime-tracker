import { PrismaD1 } from '@prisma/adapter-d1'
import { PrismaClient } from '../generated/prisma/client.ts'

export function createPrismaClient(db: D1Database): PrismaClient {
  const adapter = new PrismaD1(db)
  return new PrismaClient({ adapter })
}
