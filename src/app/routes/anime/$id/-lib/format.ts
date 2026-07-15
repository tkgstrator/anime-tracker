import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'

dayjs.extend(duration)

export function formatDuration(seconds: number): string {
  const d = dayjs.duration(seconds, 'seconds')
  return d.hours() > 0 ? d.format('H:mm:ss') : d.format('m:ss')
}

export function formatDate(dateStr: string): string {
  return dayjs(dateStr).format('YYYY/MM/DD')
}

export function getWatchUrl(provider: string, episodeId: string): string | null {
  if (!episodeId) return null
  switch (provider) {
    case 'amazon':
      return `https://www.amazon.co.jp/gp/video/detail/${episodeId}`
    case 'hulu':
      return `https://www.hulu.jp/watch/${episodeId}`
    case 'crunchyroll':
      return `https://www.crunchyroll.com/watch/${episodeId}`
    case 'abema':
      return `https://abema.tv/video/episode/${episodeId}`
    default:
      return null
  }
}

export function getProviderTitleUrl(provider: string, contentId: string): string | null {
  if (!contentId) return null
  switch (provider) {
    case 'amazon':
      return `https://www.amazon.co.jp/gp/video/detail/${contentId}`
    case 'hulu':
      return `https://www.hulu.jp/${contentId}`
    case 'crunchyroll':
      return `https://www.crunchyroll.com/series/${contentId}`
    case 'abema':
      return `https://abema.tv/video/title/${contentId}`
    case 'netflix':
      return `https://www.netflix.com/title/${contentId}`
    default:
      return null
  }
}
