import dayjs from 'dayjs'
import { TokenResponseSchema } from '../../../schemas/providers/crunchyroll.dto'

const TOKEN_URL = 'https://www.crunchyroll.com/auth/v1/token'
/** Web anonymous client credentials (public) */
const BASIC_AUTH = 'Basic dC1rZGdwMmg4YzNqdWI4Zm4wZnE6eWZMRGZNZnJZdktYaDRKWFMxTEVJMmNDcXUxdjVXYW4='

const tokenCache = { token: null as string | null, expiresAt: dayjs(0) }

/**
 * Anonymous Bearer トークンを取得する。
 * キャッシュ済みで有効期限内ならそのまま返す。
 */
export async function getAccessToken(): Promise<string> {
  if (tokenCache.token && dayjs().isBefore(tokenCache.expiresAt)) return tokenCache.token

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: BASIC_AUTH,
      'ETP-Anonymous-ID': crypto.randomUUID()
    },
    body: new URLSearchParams({
      grant_type: 'client_id',
      scope: 'offline_access',
      device_id: crypto.randomUUID(),
      device_type: 'Firefox on Linux',
      device_name: 'Firefox'
    })
  })

  if (!res.ok) {
    throw new Error(`Crunchyroll auth failed: ${res.status} ${res.statusText}`)
  }

  const data = TokenResponseSchema.parse(await res.json())
  tokenCache.token = data.access_token
  // 有効期限の 60 秒前にリフレッシュ
  tokenCache.expiresAt = dayjs().add(data.expires_in - 60, 'second')
  return tokenCache.token
}
