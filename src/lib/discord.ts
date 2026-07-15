import { getAppLogger } from './logger'

const logger = getAppLogger('discord')

interface EmbedField {
  name: string
  value: string
  inline?: boolean
}

interface NotifyOptions {
  title: string
  description: string
  fields?: EmbedField[]
  color?: number
  thumbnailUrl?: string
}

const COLOR_ERROR = 0xed4245
const COLOR_WARN = 0xfee75c
const COLOR_SUCCESS = 0x57f287

export async function notify(webhookUrl: string, options: NotifyOptions): Promise<void> {
  const body = {
    embeds: [
      {
        title: options.title,
        description: options.description,
        color: options.color ?? COLOR_ERROR,
        fields: options.fields ?? [],
        thumbnail: options.thumbnailUrl ? { url: options.thumbnailUrl } : undefined,
        timestamp: new Date().toISOString()
      }
    ]
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (!res.ok) {
      logger.error({ action: 'webhook-failed', status: res.status })
    }
  } catch (e) {
    logger.error({ action: 'webhook-error', error: e instanceof Error ? e.message : String(e) })
  }
}

export { COLOR_ERROR, COLOR_SUCCESS, COLOR_WARN }
