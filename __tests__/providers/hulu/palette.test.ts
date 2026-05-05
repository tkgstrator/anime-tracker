import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { FalcorMetaResponseSchema, PaletteResponseSchema, VodItemSchema } from '../../../src/schemas/providers/hulu.dto'

const fixturesDir = resolve(__dirname, '../../fixtures/hulu')
const readJson = (name: string) => JSON.parse(readFileSync(resolve(fixturesDir, name), 'utf-8'))

describe('PaletteResponseSchema', () => {
  test('正常なパレットレスポンスをパースできる', () => {
    const raw = readJson('palettes-recentlyadded-anime-p1.json')
    const result = PaletteResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.total_count).toBeGreaterThan(0)
    expect(result.data.data.length).toBeGreaterThan(0)
  })

  test('コミック宣伝や空endAtを含むパレットでもクラッシュしない', () => {
    const raw = readJson('palettes-season-mixed.json')
    const result = PaletteResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.total_count).toBe(79)
    expect(result.data.data.length).toBeGreaterThanOrEqual(4)
  })

  test('今季パレット p1 をパースできる', () => {
    const raw = readJson('palettes-spring-2026-p1.json')
    const result = PaletteResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.total_count).toBe(79)
    expect(result.data.data.length).toBeGreaterThan(0)
  })

  test('今季パレット p2 のコミック宣伝がフィルタされる', () => {
    const raw = readJson('palettes-spring-2026-p2.json')
    const result = PaletteResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data.data.length).toBe(28)
    for (const item of result.data.data) {
      expect(item.slug).toBeTruthy()
    }
  })

  test('Filtered API レスポンスをパースできる', () => {
    for (const name of [
      'filtered-genre-anime-p1.json',
      'filtered-decade-2020s-p1.json',
      'filtered-recently-updated-p1.json',
      'filtered-expiring-p1.json'
    ]) {
      const raw = readJson(name)
      const result = PaletteResponseSchema.safeParse(raw)
      expect(result.success).toBe(true)
      if (!result.success) continue
      expect(result.data.total_count).toBeGreaterThan(0)
      expect(result.data.data.length).toBeGreaterThan(0)
    }
  })
})

describe('VodItemSchema', () => {
  test('正常なアイテムをパースできる', () => {
    const raw = readJson('palettes-recentlyadded-anime-p1.json')
    const item = raw.data.find((i: Record<string, unknown>) => i.slug && i.additionalInfo)
    const result = VodItemSchema.safeParse(item)
    expect(result.success).toBe(true)
  })

  test('endAtが空文字のアイテムではnullになる', () => {
    const raw = readJson('palettes-spring-2026-p1.json')
    const item = raw.data.find((i: Record<string, unknown>) => i.endAt === '')
    expect(item).toBeTruthy()
    const result = VodItemSchema.safeParse(item)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.data.endAt).toBeNull()
    }
  })

  test('endAtフィールドが存在しないアイテムはパース失敗する', () => {
    const raw = readJson('palettes-season-mixed.json')
    const item = raw.data.find((i: Record<string, unknown>) => !('endAt' in i))
    const result = VodItemSchema.safeParse(item)
    expect(result.success).toBe(false)
  })

  test('slug/additionalInfoがないコミック宣伝アイテムはパース失敗する', () => {
    const raw = readJson('palettes-spring-2026-p2.json')
    const item = raw.data.find((i: Record<string, unknown>) => !i.slug)
    expect(item).toBeTruthy()
    const result = VodItemSchema.safeParse(item)
    expect(result.success).toBe(false)
  })
})

describe('FalcorMetaResponseSchema', () => {
  test('Falcor メタレスポンスをパースできる', () => {
    const raw = readJson('falcor-meta-frieren.json')
    const result = FalcorMetaResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    const meta = result.data.jsonGraph.meta
    expect(meta.name).toBe('葬送のフリーレン')
    expect(meta.slug).toBe('frieren-beyond-journeys-end')
    expect(meta.imageUrl).not.toContain('?')
  })

  test('別タイトルのFalcorメタをパースできる', () => {
    const raw = readJson('falcor-meta-apothecary-diaries.json')
    const result = FalcorMetaResponseSchema.safeParse(raw)
    expect(result.success).toBe(true)
    if (!result.success) return
    const meta = result.data.jsonGraph.meta
    expect(meta.name).toBeTruthy()
    expect(meta.slug).toBe('the-apothecary-diaries')
  })
})
