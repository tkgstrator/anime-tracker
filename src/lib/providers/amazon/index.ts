import { parse as parseHtml } from 'node-html-parser'
import type { ProviderTitle, ProviderTitleDetail } from '../../../schemas/provider.dto'
import { type FetchTitleListOptions, Provider } from '../base'
import { buildAmazonBrowseUrl } from './browse'
import { fetchAmazonTitleDetail, fetchHtml, htmlUnescape, mapEntityType } from './detail'

/**
 * ブラウズページの HTML から <script type="application/json"> を抽出し、
 * タイトル一覧をパースする。
 *
 * @param html - ブラウズページの HTML 文字列
 * @returns パースされたタイトル一覧
 */
interface BrowseEntity {
  title: ProviderTitle
  hasNewEpisode: boolean
}

export function parseBrowseHtml(html: string): BrowseEntity[] {
  const root = parseHtml(html)

  // // --- 旧実装: scriptタグ全体を結合して正規表現で抽出 ---
  // const scriptContent = root
  //   .querySelectorAll('script')
  //   .map((s) => s.textContent)
  //   .join('\n')
  // const titles: ProviderTitle[] = []
  // const itemRegex =
  //   /"titleID"\s*:\s*"([^"]+)"[^}]*?"displayTitle"\s*:\s*"([^"]+)"[^}]*?"synopsis"\s*:\s*"([^"]*)"[^}]*?"entityType"\s*:\s*"([^"]+)"/g
  //
  // for (const m of scriptContent.matchAll(itemRegex)) {
  //   titles.push({
  //     contentId: m[1],
  //     title: htmlUnescape(m[2]),
  //     description: htmlUnescape(m[3]),
  //     entityType: mapEntityType(m[4]),
  //     imageUrl: null,
  //     maturityRating: null
  //   })
  // }
  // return titles

  const jsonScript = root
    .querySelectorAll('script[type="application/json"]')
    .find((s) => s.textContent.includes('titleID'))

  if (!jsonScript) return []

  const data = JSON.parse(jsonScript.textContent) as {
    init?: {
      preparations?: {
        body?: {
          containers?: { entities?: Record<string, unknown>[] }[]
        }
      }
    }
  }

  const entities = data.init?.preparations?.body?.containers?.flatMap((c) => c.entities ?? []) ?? []

  return entities.map((e) => ({
    title: {
      contentId: e.titleID as string,
      title: htmlUnescape(e.displayTitle as string),
      description: htmlUnescape((e.synopsis as string) ?? ''),
      entityType: mapEntityType(e.entityType as string),
      imageUrl: ((e.images as { cover?: { url?: string } })?.cover?.url as string) ?? null,
      maturityRating: null
    },
    hasNewEpisode:
      (e.entitlementCues as { titleMetadataBadge?: { message?: string } } | undefined)?.titleMetadataBadge?.message ===
      '新エピソード'
  }))
}

/**
 * Amazon Prime Video プロバイダ。
 *
 * Prime Video のブラウズ API からアニメタイトル一覧を取得し、
 * 詳細ページからシーズン・エピソード情報を取得する。
 */
export class AmazonProvider extends Provider {
  readonly name = 'amazon'

  /**
   * Prime Video のアニメタイトル一覧を取得する。
   *
   * ブラウズ URL を生成し、HTML をパースしてタイトル一覧を返す。
   * @returns アニメタイトル一覧
   */
  async fetchTitleList(options?: FetchTitleListOptions): Promise<ProviderTitle[]> {
    const url = buildAmazonBrowseUrl()
    const html = await fetchHtml(url)
    const entries = parseBrowseHtml(html)
    if (options?.newEpisodesOnly) {
      return entries.filter((e) => e.hasNewEpisode).map((e) => e.title)
    }
    return entries.map((e) => e.title)
  }

  /**
   * コンテンツ ID からタイトル詳細 (シーズン・エピソード含む) を取得する。
   * @param contentId - Prime Video のタイトル ID (例: "B0CJRFZ6JD")
   * @returns タイトル詳細情報
   */
  async fetchEpisodeList(contentId: string): Promise<ProviderTitleDetail> {
    return fetchAmazonTitleDetail(contentId)
  }
}

export { buildAmazonBrowseUrl, buildSearchParams, buildServiceToken } from './browse'
export { fetchAmazonTitleDetail } from './detail'
