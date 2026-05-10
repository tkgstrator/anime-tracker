import dayjs from 'dayjs'
import { AbemaTokenResponseSchema } from '../../../schemas/providers/abema.dto'

const LOGIN_URL = 'https://abema.tv/api/auth/login/guest'
const HMAC_SECRET =
  'v+Gjs=25Aw5erR!J8ZuvRrCx*rGswhB&qdHd_SYerEWdU&a?3DzN9BRbp5KwY4hEmcj5#fykMjJ=AuWz5GSMY-d@H7DMEh3M@9n2G552Us$$k9cD=3TxwWe86!x#Zyhe'

const sessionCache: { token: string | null; deviceId: string | null; expiresAt: dayjs.Dayjs } = {
  token: null,
  deviceId: null,
  expiresAt: dayjs(0)
}

export interface AbemaGuestSession {
  token: string
  deviceId: string
}

function toBase64Url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replaceAll('=', '')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
}

async function hmacSign(key: CryptoKey, data: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const sig = await crypto.subtle.sign('HMAC', key, data)
  return new Uint8Array(sig) as Uint8Array<ArrayBuffer>
}

async function iteratedHmac(
  key: CryptoKey,
  input: Uint8Array<ArrayBuffer>,
  rounds: number
): Promise<Uint8Array<ArrayBuffer>> {
  let result = input
  for (let i = 0; i < rounds + 1; i++) {
    result = await hmacSign(key, result)
  }
  return result
}

async function generateApplicationKeySecret(deviceId: string, date: Date): Promise<string> {
  const enc = new TextEncoder()
  const secretBytes = enc.encode(HMAC_SECRET)

  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])

  const step1 = await iteratedHmac(key, secretBytes, date.getUTCMonth() + 1)
  const step2 = await iteratedHmac(key, enc.encode(toBase64Url(step1) + deviceId), date.getUTCDate() % 5)
  const timestamp = String(Math.floor(date.getTime() / 1000))
  const step3 = await iteratedHmac(key, enc.encode(toBase64Url(step2) + timestamp), date.getUTCHours() % 5)
  return toBase64Url(step3)
}

function getKeyDate(): Date {
  const d = new Date()
  d.setHours(d.getHours() + 1)
  d.setMinutes(0)
  d.setSeconds(0)
  d.setMilliseconds(0)
  return d
}

export async function getGuestSession(): Promise<AbemaGuestSession> {
  if (sessionCache.token && sessionCache.deviceId && dayjs().isBefore(sessionCache.expiresAt)) {
    return { token: sessionCache.token, deviceId: sessionCache.deviceId }
  }

  const deviceId = crypto.randomUUID()
  const keyDate = getKeyDate()
  const applicationKeySecret = await generateApplicationKeySecret(deviceId, keyDate)

  const res = await fetch(LOGIN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: 'https://abema.tv',
      Referer: 'https://abema.tv/'
    },
    body: JSON.stringify({
      device_id: deviceId,
      application_key_secret: applicationKeySecret,
      device_type: 3,
      previous_user_id: ''
    })
  })

  if (!res.ok) {
    throw new Error(`ABEMA auth failed: ${res.status} ${res.statusText}`)
  }

  const result = AbemaTokenResponseSchema.safeParse(await res.json())
  if (!result.success) throw result.error

  sessionCache.token = result.data.access_token
  sessionCache.deviceId = deviceId
  sessionCache.expiresAt = dayjs().add(2, 'hour')
  return { token: sessionCache.token, deviceId }
}

export async function getAccessToken(): Promise<string> {
  const { token } = await getGuestSession()
  return token
}
