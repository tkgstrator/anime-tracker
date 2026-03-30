/**
 * Lambda エンドポイントの結合テスト。
 * ローカルでのみ実行（CI では AWS 認証情報がないためスキップ）。
 * 生データは __tests__/fixtures/{provider}/episodes_refetched/ に保存。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { AwsClient } from 'aws4fetch'
import type { TitleInfo } from '../src/schemas/providers/common.dto'
import { TitleInfoSchema } from '../src/schemas/providers/common.dto'

const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID ?? ''
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY ?? ''
const JP_URL = process.env.LAMBDA_FUNCTION_URL ?? ''
const US_URL = process.env.LAMBDA_FUNCTION_URL_US ?? ''

const canRun = ACCESS_KEY && SECRET_KEY && JP_URL
const describeLocal = canRun ? describe : describe.skip
const describeUS = canRun && US_URL ? describe : describe.skip

const aws = new AwsClient({ accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY })

async function post(baseUrl: string, path: string, body: Record<string, string>) {
  const url = `${baseUrl.replace(/\/$/, '')}${path}`
  const res = await aws.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  expect(res.ok).toBe(true)
  return res.json()
}

function saveFixture(provider: string, contentId: string, data: unknown) {
  const dir = `__tests__/fixtures/${provider}/episodes_refetched`
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}/${contentId}.json`, JSON.stringify(data, null, 2))
}

async function fetchTitleInfo(baseUrl: string, provider: string, contentId: string): Promise<TitleInfo> {
  const data = await post(baseUrl, '/title_info', { provider, contentId })
  saveFixture(provider, contentId, data)

  const detail = TitleInfoSchema.parse(data)
  expect(detail.title).toBeTruthy()
  expect(detail.seasons.length).toBeGreaterThan(0)
  return detail
}

/** 同一作品のプロバイダ間データ比較（シーズン数・エピソード数のみ） */
function compareProviders(results: Record<string, TitleInfo>) {
  const providers = Object.keys(results)
  if (providers.length < 2) return

  const base = results[providers[0]]
  const baseProvider = providers[0]

  for (const provider of providers.slice(1)) {
    const other = results[provider]

    // シーズン数が一致すること
    expect(other.seasons.length, `seasons count: ${baseProvider} vs ${provider}`).toBe(base.seasons.length)

    // 各シーズンのエピソード数が一致すること
    for (let i = 0; i < base.seasons.length; i++) {
      expect(
        other.seasons[i].episodes.length,
        `season ${i + 1} episode count: ${baseProvider} vs ${provider}`
      ).toBe(base.seasons[i].episodes.length)
    }
  }
}

/** テスト対象の作品定義（同一作品のプロバイダ間比較） */
const TITLES = {
  shiboyugi: {
    label: '死亡遊戯で飯を食う。',
    amazon: { url: 'jp', contentId: 'B0F88J8N9N' },
    hulu: { url: 'jp', contentId: 'shiboyugi-playing-death-games-to-put-food-on-the-table' },
    crunchyroll: { url: 'us', contentId: 'GT00365787' }
  },
  newPanst: {
    label: 'New PANTY & STOCKING with GARTERBELT',
    amazon: { url: 'jp', contentId: 'B0FF2WZYM4' },
    hulu: { url: 'jp', contentId: 'new-panty-and-stocking-with-garterbelt' }
  },
  saoMovie: {
    label: '劇場版 ソードアート・オンライン -オーディナル・スケール-',
    amazon: { url: 'jp', contentId: 'B0FLDMCJ6W' },
    hulu: { url: 'jp', contentId: 'sword-art-online-the-movie-ordinal-scale' }
  },
  koeNoKatachi: {
    label: '聲の形',
    amazon: { url: 'jp', contentId: 'B0D4RQ2FWW' },
    crunchyroll: { url: 'us', contentId: 'GP5HJ84XV' }
  }
} as const

function resolveUrl(region: 'jp' | 'us') {
  return region === 'jp' ? JP_URL : US_URL
}

// --- 個別プロバイダテスト ---

describeLocal('Lambda JP - Amazon /title_info', () => {
  test('死亡遊戯で飯を食う。', () => fetchTitleInfo(JP_URL, 'amazon', 'B0F88J8N9N'), 30_000)
  test('New PANTY & STOCKING with GARTERBELT', () => fetchTitleInfo(JP_URL, 'amazon', 'B0FF2WZYM4'), 30_000)
  test('New PANTY & STOCKING with GARTERBELT (別ID)', () => fetchTitleInfo(JP_URL, 'amazon', 'B0FFL2WFG8'), 30_000)
  test('劇場版 ソードアート・オンライン -オーディナル・スケール-', () =>
    fetchTitleInfo(JP_URL, 'amazon', 'B0FLDMCJ6W'), 30_000)
  test('聲の形', () => fetchTitleInfo(JP_URL, 'amazon', 'B0D4RQ2FWW'), 30_000)
})

describeLocal('Lambda JP - Hulu /title_info', () => {
  test('死亡遊戯で飯を食う。', () =>
    fetchTitleInfo(JP_URL, 'hulu', 'shiboyugi-playing-death-games-to-put-food-on-the-table'), 30_000)
  test('New PANTY & STOCKING with GARTERBELT', () =>
    fetchTitleInfo(JP_URL, 'hulu', 'new-panty-and-stocking-with-garterbelt'), 30_000)
  test('劇場版 ソードアート・オンライン -オーディナル・スケール-', () =>
    fetchTitleInfo(JP_URL, 'hulu', 'sword-art-online-the-movie-ordinal-scale'), 30_000)
})

describeUS('Lambda US - Crunchyroll /title_info', () => {
  test('死亡遊戯で飯を食う。', () => fetchTitleInfo(US_URL, 'crunchyroll', 'GT00365787'), 30_000)
  test('Panty & Stocking with Garterbelt', () => fetchTitleInfo(US_URL, 'crunchyroll', 'GYNV02MJR'), 30_000)
  test('聲の形', () => fetchTitleInfo(US_URL, 'crunchyroll', 'GP5HJ84XV'), 30_000)
})

// --- プロバイダ間比較テスト ---

describeLocal('Cross-provider comparison', () => {
  for (const [_key, title] of Object.entries(TITLES)) {
    const hasUS = Object.values(title).some((v) => typeof v === 'object' && 'url' in v && v.url === 'us')
    const describeFn = hasUS && !US_URL ? test.skip : test

    describeFn(
      title.label,
      async () => {
        const results: Record<string, TitleInfo> = {}
        for (const [k, v] of Object.entries(title)) {
          if (k === 'label' || typeof v !== 'object' || !('url' in v)) continue
          const { url, contentId } = v as { url: 'jp' | 'us'; contentId: string }
          results[k] = await fetchTitleInfo(resolveUrl(url), k, contentId)
        }

        // 比較用にエピソード単位まで展開したサマリーを出力
        const dir = '__tests__/fixtures/comparison'
        mkdirSync(dir, { recursive: true })
        const slug = _key
        writeFileSync(`${dir}/${slug}.json`, JSON.stringify(results, null, 2))

        compareProviders(results)
      },
      60_000
    )
  }
})
