import type { TitleInfo } from '../schemas/providers/common.dto'
import { fetchAbemaTitleDetail } from './providers/abema/detail'
import { fetchHuluTitleDetail } from './providers/hulu/detail'

export const localDetailFetchers: Record<string, (contentId: string) => Promise<TitleInfo>> = {
  abema: fetchAbemaTitleDetail,
  hulu: fetchHuluTitleDetail
}
