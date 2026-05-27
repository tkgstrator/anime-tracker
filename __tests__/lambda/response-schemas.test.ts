import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ExpiringResponseSchema,
  FetchAbemaArchiveResponseSchema,
  IdentifyResponseSchema,
  TitleListResponseSchema
} from '../../src/schemas/lambda.dto'

const fixturesDir = resolve(__dirname, '../fixtures/lambda')
const readFixture = (name: string): unknown => JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))

// Fixtures are real Lambda responses captured via `bun scripts/lambda/local.ts`
// (entries / segmentUrls trimmed for size). They guard the Worker<->Lambda
// response contract: if a provider changes shape, the Zod envelope parse fails.
describe('Lambda response envelopes parse captured fixtures', () => {
  test('/identify → IdentifyResponseSchema', () => {
    const parsed = IdentifyResponseSchema.parse(readFixture('identify.json'))
    expect(parsed.results.length).toBeGreaterThan(0)
  })

  test('/title_list (amazon) → TitleListResponseSchema', () => {
    const parsed = TitleListResponseSchema.parse(readFixture('title_list-amazon.json'))
    expect(parsed.entries.length).toBeGreaterThan(0)
  })

  test('/expiring (amazon) → ExpiringResponseSchema', () => {
    const parsed = ExpiringResponseSchema.parse(readFixture('expiring-amazon.json'))
    expect(parsed.entries.length).toBeGreaterThan(0)
  })

  test('/title_info abema-archive → FetchAbemaArchiveResponseSchema', () => {
    const parsed = FetchAbemaArchiveResponseSchema.parse(readFixture('abema-archive.json'))
    expect(parsed.results.length).toBeGreaterThan(0)
    expect(parsed.results.some((r) => r.ok)).toBe(true)
  })
})
