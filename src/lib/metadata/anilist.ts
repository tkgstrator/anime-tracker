import jaconv from 'jaconv'
import { z } from 'zod'
import { MetadataMediaSchema, MetadataResponseSchema, type TitleMetadata } from '../../schemas/providers/metadata.dto'
import { MetadataAdapter } from './base'

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
    }
  }
}
`

type MetadataMedia = z.infer<typeof MetadataMediaSchema>

const SEASON_TO_QUARTER: Record<MetadataMedia['season'], number> = {
  WINTER: 0,
  SPRING: 1,
  SUMMER: 2,
  FALL: 3
}

async function fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status !== 429) return res
  const retryAfter = Math.min(Number(res.headers.get('Retry-After') || '2'), 5)
  await new Promise((r) => setTimeout(r, retryAfter * 1000))
  return fetch(url, init)
}

async function identifyAniList(rawTitle: string): Promise<MetadataMedia> {
  const search = cleanTitle(rawTitle)

  const res = await fetchWithRetry(ANILIST_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ query: SEARCH_QUERY, variables: { search } })
  })

  if (!res.ok) throw new Error(`AniList API error: ${res.status} ${res.statusText}`)

  const parsed = MetadataResponseSchema.parse(await res.json())
  return parsed.data.Page.media[0]
}

export class AniListAdapter extends MetadataAdapter {
  readonly name = 'anilist'

  async identify(rawTitle: string): Promise<TitleMetadata | undefined> {
    const result = await identifyAniList(rawTitle)
    return {
      aniListId: result.id,
      title: result.title.native,
      status: result.status,
      year: result.seasonYear,
      quarter: SEASON_TO_QUARTER[result.season]
    }
  }
}
