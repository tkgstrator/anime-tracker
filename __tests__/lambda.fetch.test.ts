/**
 * Lambda エンドポイントの結合テスト。
 * ローカルでのみ実行（CI では AWS 認証情報がないためスキップ）。
 * 生データは __tests__/fixtures/{provider}/episodes_refetched/ に保存。
 * パース結果は __tests__/fixtures/{provider}/titles/ に保存。
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { describe, expect, test } from 'bun:test'
import { AwsClient } from 'aws4fetch'
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

function saveFixture(provider: string, contentId: string, raw: unknown, parsed: unknown) {
  const refetchedDir = `__tests__/fixtures/${provider}/episodes_refetched`
  const titlesDir = `__tests__/fixtures/${provider}/titles`
  mkdirSync(refetchedDir, { recursive: true })
  mkdirSync(titlesDir, { recursive: true })

  writeFileSync(`${refetchedDir}/${contentId}.json`, JSON.stringify(raw, null, 2))
  writeFileSync(`${titlesDir}/${contentId}.json`, JSON.stringify(parsed, null, 2))
}

async function testTitleInfo(baseUrl: string, provider: string, contentId: string) {
  const data = await post(baseUrl, '/title_info', { provider, contentId })
  saveFixture(provider, contentId, data, data)

  const detail = TitleInfoSchema.parse(data)
  saveFixture(provider, contentId, data, detail)
  expect(detail.title).toBeTruthy()
  expect(detail.seasons.length).toBeGreaterThan(0)
}

describeLocal('Lambda JP - Amazon /title_info', () => {
  test('B0F88J8N9N (死亡遊戯で飯を食う)', () => testTitleInfo(JP_URL, 'amazon', 'B0F88J8N9N'), 30_000)
  test('B0FF2WZYM4 (パンスト)', () => testTitleInfo(JP_URL, 'amazon', 'B0FF2WZYM4'), 30_000)
  test('B0FFL2WFG8 (パンスト)', () => testTitleInfo(JP_URL, 'amazon', 'B0FFL2WFG8'), 30_000)
})

describeLocal('Lambda JP - Hulu /title_info', () => {
  test('shiboyugi (死亡遊戯で飯を食う)', () =>
    testTitleInfo(JP_URL, 'hulu', 'shiboyugi-playing-death-games-to-put-food-on-the-table'), 30_000)
  test('new-panty-and-stocking (パンスト)', () =>
    testTitleInfo(JP_URL, 'hulu', 'new-panty-and-stocking-with-garterbelt'), 30_000)
})

describeUS('Lambda US - Crunchyroll /title_info', () => {
  test('GT00365787 (死亡遊戯で飯を食う)', () => testTitleInfo(US_URL, 'crunchyroll', 'GT00365787'), 30_000)
  test('GYNV02MJR (パンスト)', () => testTitleInfo(US_URL, 'crunchyroll', 'GYNV02MJR'), 30_000)
})
