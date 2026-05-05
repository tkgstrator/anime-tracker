import jaconv from 'jaconv'
import type { z } from 'zod'
import { MetadataMediaSchema, MetadataResponseSchema, type TitleMetadata } from '../../schemas/providers/metadata.dto'
import type { FetchClient } from '../lambda'
import { getAppLogger } from '../logger'
import { MetadataAdapter } from './base'

const logger = getAppLogger('anilist')

const ANILIST_API = 'https://graphql.anilist.co'

/**
 * Prime Video / Hulu のタイトルから余計な装飾を除去して AniList 検索用に整える
 */
export function cleanTitle(raw: string): string {
  const trimmed = raw.trim()
  // 【...】 プロモ文を除去
  // 全体が【タイトル】のみ（or 【タイトル】+期/シーズン等）の場合は中身を残す
  const isTitleBracket = /^【[^】]+】(?:\s*第?\d*[期シーズンクール]*\s*)*$/.test(trimmed)
  const bracketCleaned = isTitleBracket ? trimmed.replace(/^【([^】]+)】/, '$1') : trimmed.replace(/【[^】]*】/g, '')

  return (
    bracketCleaned
      // 全角ASCII（英数・記号）を半角に変換
      .replace(/^.*$/, (s) => jaconv.toHanAscii(s))
      // 半角中黒を全角に統一
      .replace(/\uff65/g, '・')
      // (字幕版) (吹替版) 等を除去
      .replace(/[（(][^)）]*(?:字幕|吹替)[^)）]*[)）]/g, '')
      // 半角カッコの注釈を除去: (TV版) (レンタル版) (2009年放送版) (dアニメストア) (フジテレビオンデマンド) 等
      .replace(/\s*\([^)]*(?:版|放送|dアニメストア|フジテレビ|オンデマンド)[^)]*\)/g, '')
      // 末尾 (年) を除去: タイトル (2026) → タイトル
      .replace(/\s*[（(]\d{4}[)）]\s*$/, '')
      // カッコの注釈を除去: （ジークアクス）/ (ジークアクス) 等
      .replace(/\s*[（(][^)）]*[)）]/g, '')
      // 《...》 ＜...＞ を除去（ただしタイトル全体が囲まれている場合は中身を残す）
      .replace(/\s*《([^》]*)》/g, (_m, inner, _o, str) =>
        str.trim().startsWith('《') && str.trim().endsWith('》') ? inner : ''
      )
      .replace(/\s*[＜<]([^＞>]*)[＞>]/g, (_m, inner, _o, str) => {
        const t = str.trim()
        return (t.startsWith('＜') || t.startsWith('<')) && (t.endsWith('＞') || t.endsWith('>')) ? inner : ''
      })
      // ~...~ 注釈を除去（半角チルダ）
      .replace(/~[^~]+~/g, '')
      // プレフィックスを除去
      .replace(/^(?:TVアニメ|テレビアニメ|アニメ|新劇場版|劇場版|劇場アニメーション|映画|Animatica|OVA|OAD)\s*/g, '')
      // プラットフォームプレフィックスを除去: NETFIXオリジナルシリーズ 等
      .replace(/^(?:NETFLIX|NETFIX)(?:オリジナル)?(?:シリーズ|アニメ)?\s*/gi, '')
      // セレクション(+後続サブタイトル) / アニメシリーズ を除去
      .replace(/\s*セレクション\s*(?:「[^」]*」)?/g, ' ')
      .replace(/\s*アニメシリーズ/g, '')
      // 『』で囲まれたタイトルを展開
      .replace(/『([^』]+)』/g, '$1 ')
      // 「」で囲まれたタイトルを展開
      .replace(/「([^」]+)」/g, '$1 ')
      // \u201C\u201D で囲まれたタイトルを展開
      .replace(/\u201C([^\u201D]+)\u201D/g, '$1 ')
      // [ルビ] 表記を除去: 頭文字[イニシャル]D → 頭文字D
      .replace(/\[([^\]]+)\]/g, '')
      // ・第N期 を除去（中黒つき）
      .replace(/・第[一二三四五六七八九十壱弐参\d]+[期クール]+/g, '')
      // 第N期 / 第壱期 / 第Nクール / NstシーズンN / Season N を除去
      .replace(/\s*第[一二三四五六七八九十壱弐参\d]+[期クール]+/g, '')
      .replace(/\s*\d+(?:st|nd|rd|th)\s*シーズン/gi, '')
      .replace(/\s*(?:シーズン|Season)\s*\d+(?:特別[篇編])?/gi, '')
      // 第Nシリーズ / Nシリーズ を除去
      .replace(/\s*第?\d+シリーズ/g, '')
      // 末尾 -サブタイトル- を除去（先頭でない場合のみ、半角・全角ダッシュ）
      .replace(/(.+)\s+[-－][^-－]+[-－]\s*$/, '$1')
      // 全体が -タイトル- / ーFOOー の場合は中身を残す
      .replace(/^[-－]([^-－]+)[-－]$/, '$1')
      // サブタイトル装飾を除去: ～...～
      .replace(/～[^～]+～/g, '')
      // 先頭の # を除去
      .replace(/^#/, '')
      // OVA / OAD / HDリマスター / SPECIAL EDITED VERSION 等のサフィックス
      .replace(/\s+(?:OVA|OAD|OAD\s.*|HDリマスター|SPECIAL\s+EDITED\s+VERSION)\s*$/gi, '')
      // 版サフィックスを除去: 新編集版, 完全版, デジタルリマスター版, TV版 等
      .replace(/\s*(?:新編集|完全|デジタルリマスター|完全ワンダフル|TV|オンエア)版/g, '')
      // ver. サフィックスを除去
      .replace(/\s+\S*ver\.?\s*$/gi, '')
      // 特別篇 / 特別編 のサフィックス
      .replace(/\s*(?:特別篇|特別編)\s*$/g, '')
      // 編 サフィックスを除去: 末尾の「〇〇編」を除去（スペース区切り or 直結）
      .replace(/(.{3,})\s+\S+編\s*[①-⑳\d]*\s*$/, '$1')
      .replace(/(.+[!！?？。\d])\S*編\s*$/, '$1')
      // シーズンN / 第Nシーズン 末尾を除去（全角数字・ローマ数字含む）
      .replace(/\s+第?\d*シーズン\s*\d*\s*$/g, '')
      // 末尾の数字のみ（ナンバリング続編）を除去: タイトル 3 → タイトル
      .replace(/\s+\d+\s*$/, '')
      // 末尾のローマ数字・丸数字を除去
      .replace(/\s+[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ①-⑳]+\s*$/, '')
      // 連続する空白を1つに
      .replace(/\s+/g, ' ')
      .trim()
  )
}

const SEARCH_QUERY = `
query ($search: String!) {
  Page(perPage: 5) {
    media(search: $search, type: ANIME) {
      id
      title {
        native
      }
      countryOfOrigin
      status
      season
      seasonYear
      startDate { year month day }
    }
  }
}
`

const MEDIA_FIELDS = `
  id
  title { native }
  countryOfOrigin
  status
  season
  seasonYear
  startDate { year month day }
`

/**
 * 最大50件のタイトルを GraphQL エイリアスで1リクエストにまとめてバッチ検索する。
 * AniList の rate limit (90 req/min) 対策として、1リクエストで複数検索を実行。
 */
function buildBatchQuery(searches: string[]): string {
  const fragments = searches.map(
    (search, i) =>
      `q${i}: Page(perPage: 5) { media(search: ${JSON.stringify(search)}, type: ANIME) { ${MEDIA_FIELDS} } }`
  )
  return `query { ${fragments.join('\n')} }`
}

type MetadataMedia = z.infer<typeof MetadataMediaSchema>

const SEASON_TO_QUARTER: Record<string, number> = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  FALL: 3
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 429) return res
  const retryAfter = Math.min(Number(res.headers.get('Retry-After') || '2'), 5)
  logger.warn({ action: 'rate-limited', retryAfter, status: res.status })
  await new Promise((r) => setTimeout(r, retryAfter * 1000))
  return fetch(url, init)
}

async function identifyAniList(rawTitle: string): Promise<MetadataMedia> {
  const search = cleanTitle(rawTitle)
  logger.debug({ action: 'identify-single', rawTitle, search })

  const res = await fetchWithRetry(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search } })
  })

  if (!res.ok) {
    logger.error({ action: 'identify-single', status: res.status, rawTitle, search })
    throw new Error(`AniList API error: ${res.status} ${res.statusText}`)
  }

  const parsed = MetadataResponseSchema.parse(await res.json())
  return parsed.data.Page.media[0]
}

const MONTH_TO_QUARTER = [0, 0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 3] as const

function toMetadata(media: MetadataMedia): TitleMetadata | undefined {
  const year = media.seasonYear ?? media.startDate.year
  const quarter = media.season
    ? SEASON_TO_QUARTER[media.season]
    : media.startDate.month
      ? MONTH_TO_QUARTER[media.startDate.month - 1]
      : null
  if (year == null || quarter == null) return undefined
  return {
    aniListId: media.id,
    title: media.title.native,
    status: media.status,
    year,
    quarter
  }
}

async function identifyBatch(rawTitles: string[]): Promise<(MetadataMedia | undefined)[]> {
  const searches = rawTitles.map((t) => cleanTitle(t))
  const query = buildBatchQuery(searches)

  logger.debug({ action: 'identify-batch-start', count: rawTitles.length })

  const res = await fetchWithRetry(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query })
  })

  if (!res.ok) {
    logger.error({ action: 'identify-batch', status: res.status, count: rawTitles.length })
    throw new Error(`AniList API error: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as { data: Record<string, { media: unknown[] }> }
  const results = searches.map((_, i) => {
    const page = data.data[`q${i}`]
    if (!page?.media?.length) return undefined
    try {
      return MetadataMediaSchema.parse(page.media[0])
    } catch {
      return undefined
    }
  })

  const identified = results.filter(Boolean).length
  logger.debug({
    action: 'identify-batch-done',
    total: rawTitles.length,
    identified,
    unidentified: rawTitles.length - identified
  })

  return results
}

export class AniListAdapter extends MetadataAdapter {
  readonly name = 'anilist'

  async identify(rawTitle: string): Promise<TitleMetadata | undefined> {
    const media = await identifyAniList(rawTitle)
    const meta = toMetadata(media)
    if (meta) {
      logger.debug({ action: 'identified', rawTitle, aniListId: meta.aniListId, title: meta.title })
    } else {
      logger.debug({ action: 'identify-no-metadata', rawTitle, mediaId: media?.id })
    }
    return meta
  }

  /**
   * 最大50件のタイトルをバッチ識別する。1リクエストで処理するため rate limit に優しい。
   * lambda が渡された場合は Lambda /identify に委譲し、Workers から AniList への直接呼び出しを回避する。
   */
  async identifyBatch(rawTitles: string[], lambda?: FetchClient): Promise<(TitleMetadata | undefined)[]> {
    if (lambda) {
      const res = await lambda.identifyTitles({ titles: rawTitles })
      return res.results.map((r) => r ?? undefined)
    }
    const mediaList = await identifyBatch(rawTitles)
    return mediaList.map((m) => (m ? toMetadata(m) : undefined))
  }
}
