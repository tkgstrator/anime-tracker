/**
 * ABEMA HLS-AES-LEGACY 鍵派生 + segment URL 取得 (Cloudflare Workers / browser 互換)
 *
 * ABEMA の HLS 配信は AES-128-CBC で事前暗号化されており、content_key は
 * 番組単位で固定 (= license endpoint を 1 度叩けば永続的に使える)。
 * このモジュールは「鍵 + segment URL リスト」を取得して KeysArchive として
 * 永続化する役目を担う。実 segment download + 復号 (700MB 級) は Workers の
 * CPU/memory limit に引っかかるため別の場所 (Python 側 nagisa CLI) で行う想定。
 *
 * 派生アルゴリズムの詳細は nagisa リポジトリの
 * `docs/providers/abema/hls.md` および `docs/providers/abema/license.md` を参照。
 *
 * Python 実装と完全に同等になるよう書いている (`nagisa/providers/abema/hls.py`)。
 */

import { getGuestSession } from './auth'

// =====================================================================
// 定数 — Python (nagisa/providers/abema/hls.py:52, constants.py) と同期必須
// =====================================================================

/**
 * ABEMA 固定 HMAC key (32 bytes).
 * KEK 派生時 `HMAC-SHA256(HMAC_KEY, cid + device_id)` のキーとして使う。
 * jackyzy823/restrictionbreaker のリバエン由来。
 */
const HMAC_KEY_HEX = '3AF0298C219469522A313570E8583005A642E73EDD58E3EA2FB7339D3DF1597E'

const HLS_LICENSE_URL = 'https://license.p-c3-e.abema-tv.com/abematv-hls'
const MEDIA_TOKEN_URL = 'https://api.p-c3-e.abema-tv.com/v1/media/token'

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

const EXT_X_KEY_RE = /#EXT-X-KEY:METHOD=(?<method>[A-Z0-9-]+)(?:,URI="(?<uri>[^"]+)")?(?:,IV=0x(?<iv>[0-9a-fA-F]+))?/
const LICENSE_URI_RE = /^abematv-license:\/\/(?<lt>[^/?#]+)$/

// =====================================================================
// 型
// =====================================================================

export interface HlsKeyEntry {
  method: string
  uri: string
  iv: Uint8Array
  licenseTicket: string
}

export interface HlsVariant {
  baseUrl: string
  keys: HlsKeyEntry[]
  segmentUrls: string[]
  segmentDurations: number[]
  targetDuration: number
}

export interface MasterVariant {
  bandwidth: number
  resolution: string
  url: string
}

/**
 * KeysArchive — Episode 1 つ分の復号情報。
 * Prisma `AbemaKeyArchive` モデルに 1:1 で対応。
 */
export interface KeysArchive {
  programId: string
  cid: string
  contentKeyHex: string
  ivHex: string
  variantUrl: string
  variantResolution: string
  variantBandwidth: number
  segmentUrls: string[]
  createdAt: Date
}

// =====================================================================
// 純関数: hex / base58 / playlist パース
// =====================================================================

function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new Error(`hex length must be even, got ${hex.length}`)
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
}

/**
 * ABEMA で使われる base58 文字列 (16 バイト固定) を Uint8Array に decode。
 * encrypted content key の取り出し用。
 */
export function base58Decode16(s: string): Uint8Array {
  // BigInt で累積乗算 (16 bytes → 128 bit、JS の Number だと精度不足)
  let n = 0n
  for (const c of s) {
    const idx = BASE58_ALPHABET.indexOf(c)
    if (idx < 0) throw new Error(`Invalid base58 character: ${JSON.stringify(c)}`)
    n = n * 58n + BigInt(idx)
  }
  const out = new Uint8Array(16)
  for (let i = 15; i >= 0; i--) {
    out[i] = Number(n & 0xffn)
    n >>= 8n
  }
  return out
}

export function parseLicenseUri(uri: string): string {
  const m = LICENSE_URI_RE.exec(uri.trim())
  if (!m?.groups) throw new Error(`Not an Abema license URI: ${JSON.stringify(uri)}`)
  return m.groups.lt
}

function resolveUrl(base: string, relative: string): string {
  return new URL(relative, base).toString()
}

export function parseMasterPlaylist(text: string, baseUrl: string): MasterVariant[] {
  const lines = text.split(/\r?\n/)
  const out: MasterVariant[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line.startsWith('#EXT-X-STREAM-INF:')) continue
    const attrs = line.substring('#EXT-X-STREAM-INF:'.length)
    let bandwidth = 0
    let resolution = ''
    for (const kv of attrs.split(',')) {
      const eq = kv.indexOf('=')
      if (eq < 0) continue
      const key = kv.substring(0, eq).trim()
      const val = kv.substring(eq + 1).trim()
      if (key === 'BANDWIDTH') bandwidth = Number.parseInt(val, 10)
      else if (key === 'RESOLUTION') resolution = val
    }
    if (i + 1 < lines.length) {
      const url = resolveUrl(baseUrl, lines[i + 1].trim())
      out.push({ bandwidth, resolution, url })
      i++
    }
  }
  return out
}

export function parseVariantPlaylist(text: string, baseUrl: string): HlsVariant {
  const out: HlsVariant = { baseUrl, keys: [], segmentUrls: [], segmentDurations: [], targetDuration: 0 }
  let nextDuration = 0
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('#EXT-X-KEY:')) {
      const m = EXT_X_KEY_RE.exec(line)
      if (!m?.groups) continue
      const method = m.groups.method
      const uri = m.groups.uri ?? ''
      const ivHex = m.groups.iv ?? ''
      let lt = ''
      try {
        lt = uri ? parseLicenseUri(uri) : ''
      } catch {
        // 無効な URI は ticket 空文字で残す
      }
      const iv = ivHex ? hexToBytes(ivHex) : new Uint8Array(0)
      out.keys.push({ method, uri, iv, licenseTicket: lt })
    } else if (line.startsWith('#EXT-X-TARGETDURATION:')) {
      const v = Number.parseInt(line.split(':', 2)[1] ?? '0', 10)
      if (!Number.isNaN(v)) out.targetDuration = v
    } else if (line.startsWith('#EXTINF:')) {
      const v = Number.parseFloat((line.split(':', 2)[1] ?? '0').replace(/,$/, ''))
      nextDuration = Number.isNaN(v) ? 0 : v
    } else if (!line.startsWith('#')) {
      out.segmentUrls.push(resolveUrl(baseUrl, line))
      out.segmentDurations.push(nextDuration)
      nextDuration = 0
    }
  }
  return out
}

// =====================================================================
// KEK 派生 + content key unwrap (WebCrypto)
// =====================================================================

/**
 * KEK = HMAC-SHA256(HMAC_KEY, cid + device_id) — 32 bytes。
 * Python 実装 (`nagisa/providers/abema/hls.py:derive_kek`) と完全等価。
 */
export async function deriveKek(cid: string, deviceId: string): Promise<Uint8Array> {
  const enc = new TextEncoder()
  const keyBytes = hexToBytes(HMAC_KEY_HEX)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', cryptoKey, enc.encode(cid + deviceId))
  return new Uint8Array(sig)
}

/**
 * AES-256-ECB で 16 バイトの暗号化キーを復号して 16 バイトの平文 AES-128 キーを得る。
 *
 * WebCrypto API は ECB を提供しないため、AES-256-CBC(IV=0) で 1 ブロックだけ
 * 復号するイディオムを使う (CBC の最初のブロックは XOR(IV=0, ECB) = ECB と等価)。
 *
 * pycryptodome の `AES.new(kek, MODE_ECB).decrypt(encrypted)` と完全に同じ
 * 結果を返す。
 */
export async function unwrapContentKey(encryptedKeyB58: string, cid: string, deviceId: string): Promise<Uint8Array> {
  const encrypted = base58Decode16(encryptedKeyB58)
  if (encrypted.length !== 16) throw new Error(`encrypted key must be 16 bytes, got ${encrypted.length}`)
  const kek = await deriveKek(cid, deviceId)

  // WebCrypto には AES-ECB が無い (= 意図的に未提供)。
  // 我々が欲しいのは ECB_decrypt(K, encrypted) (= 16B plaintext)。
  //
  // AES-CBC decrypt の各ブロック:
  //   plain[0:16]  = AES_dec(K, cipher[0:16]) XOR IV
  //   plain[16:32] = AES_dec(K, cipher[16:32]) XOR cipher[0:16]
  //
  // IV=0 とし cipher[0:16] = encrypted を渡せば plain[0:16] = ECB_dec(K, encrypted)
  // で欲しい結果が出る。WebCrypto の AES-CBC は PKCS7 を自動 strip するため、
  // plain[16:32] が「全部 0x10」になるよう cipher[16:32] を逆算で組み立てる:
  //
  //   plain[16:32] = AES_dec(K, padCipher) XOR encrypted = [0x10] * 16
  //   ⇔ AES_dec(K, padCipher) = [0x10]*16 XOR encrypted
  //   ⇔ padCipher = AES_enc(K, [0x10]*16 XOR encrypted)
  //
  // これで CBC が padding strip 後に 16B (= ECB 結果) だけ返してくれる。
  const padPlain = new Uint8Array(16)
  for (let i = 0; i < 16; i++) padPlain[i] = 0x10 ^ encrypted[i]
  const padCipher = await aesEcbEncryptBlock(kek, padPlain)

  const fullCipher = new Uint8Array(32)
  fullCipher.set(encrypted, 0)
  fullCipher.set(padCipher, 16)

  const cryptoKey = await crypto.subtle.importKey('raw', kek, { name: 'AES-CBC', length: 256 }, false, ['decrypt'])
  const plain = new Uint8Array(
    await crypto.subtle.decrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, cryptoKey, fullCipher)
  )
  if (plain.length !== 16) {
    throw new Error(`unwrapContentKey: expected 16 bytes plaintext after CBC PKCS7 strip, got ${plain.length}`)
  }
  return plain
}

/**
 * AES-256-ECB で 1 ブロック (16 bytes) を暗号化する。
 * WebCrypto には ECB が無いので、IV=0 の AES-CBC で 1 ブロック暗号化と等価。
 * (pkcs7 padding が付くため出力は 32 bytes、先頭 16B が真の暗号文)
 */
async function aesEcbEncryptBlock(key: Uint8Array, block: Uint8Array): Promise<Uint8Array> {
  if (block.length !== 16) throw new Error('aesEcbEncryptBlock requires exactly 16 bytes input')
  const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'AES-CBC', length: key.length * 8 }, false, [
    'encrypt'
  ])
  const out = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: new Uint8Array(16) }, cryptoKey, block))
  return out.slice(0, 16)
}

// =====================================================================
// HTTP I/O
// =====================================================================

export class PlaybackNotAllowedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaybackNotAllowedError'
  }
}

interface LicenseResponse {
  cid: string
  k: string
}

/**
 * `POST /abematv-hls?t={mediaToken}` を叩いて (cid, encrypted_k_base58) を返す。
 *
 * 403 `playback not allowed` のとき :class:`PlaybackNotAllowedError` を投げる
 * (= 無料配信終了 / 地域制限 / プレミアム限定)。
 */
export async function requestLicense(
  licenseTicket: string,
  opts: { mediaToken: string; bearer?: string }
): Promise<LicenseResponse> {
  const url = new URL(HLS_LICENSE_URL)
  url.searchParams.set('t', opts.mediaToken)
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Origin: 'https://abema.tv',
    Referer: 'https://abema.tv/'
  }
  if (opts.bearer) headers.Authorization = `Bearer ${opts.bearer}`
  const resp = await fetch(url.toString(), {
    method: 'POST',
    headers,
    body: JSON.stringify({ kv: 'a', lt: licenseTicket })
  })
  if (resp.status === 403) {
    let msg = 'playback not allowed'
    try {
      const body = (await resp.json()) as { error?: string }
      if (body?.error) msg = body.error
    } catch {
      // ignore
    }
    throw new PlaybackNotAllowedError(`Abema HLS license 403: ${msg}`)
  }
  if (!resp.ok) {
    throw new Error(`Abema HLS license HTTP ${resp.status}`)
  }
  const body = (await resp.json()) as Partial<LicenseResponse>
  if (!body.cid || !body.k) {
    throw new Error(`Abema HLS license: unexpected response ${JSON.stringify(body)}`)
  }
  return body as LicenseResponse
}

/**
 * `GET /v1/media/token` で manifest 用の short-lived token を取得する。
 * master playlist URL に `?t={mediaToken}` で付与する必要がある。
 */
export async function fetchMediaToken(opts: { bearer: string }): Promise<string> {
  const url = new URL(MEDIA_TOKEN_URL)
  url.searchParams.set('osName', 'pc')
  url.searchParams.set('osVersion', '1.0.0')
  url.searchParams.set('osLang', 'ja_JP')
  url.searchParams.set('osTimezone', 'Asia/Tokyo')
  url.searchParams.set('appId', 'tv.abema')
  url.searchParams.set('appVersion', '0.0.1')
  const resp = await fetch(url.toString(), {
    headers: {
      Authorization: `bearer ${opts.bearer}`,
      Accept: 'application/json',
      Origin: 'https://abema.tv',
      Referer: 'https://abema.tv/'
    }
  })
  if (!resp.ok) {
    throw new Error(`Abema media token HTTP ${resp.status}`)
  }
  const body = (await resp.json()) as { token?: string }
  if (!body.token) throw new Error(`Abema media token: missing token in ${JSON.stringify(body)}`)
  return body.token
}

// =====================================================================
// 高レベル: 1 episode 分の KeysArchive を作る
// =====================================================================

export interface BuildKeysArchiveInput {
  programId: string
  /** /v1/media/token で取得した manifest ticket */
  mediaToken: string
  /** master playlist URL (= https://vod-abematv.akamaized.net/program/{programId}/playlist.m3u8) */
  masterUrl?: string
  /** 選択する解像度の上限 (例: 180 / 720 / 1080)。0 で最高画質 */
  targetHeight?: number
  /** KEK 派生に使う device_id。getGuestSession() の deviceId と必ず同じ値を渡す */
  deviceId?: string
}

export interface BuildKeysArchiveDeps {
  /**
   * `getAccessToken` の差し替え用 (テスト時)。本番は `./auth` の guest token を使う。
   * device_id も合わせて返す必要があるが、現状の auth.ts は token しか返さないため
   * device_id は呼び出し側で別途渡す。
   */
  fetchText: (url: string, init?: RequestInit) => Promise<string>
}

const defaultFetchText: BuildKeysArchiveDeps['fetchText'] = async (url, init) => {
  const resp = await fetch(url, init)
  if (!resp.ok) throw new Error(`HTTP ${resp.status} ${url}`)
  return await resp.text()
}

function pickVariant(variants: MasterVariant[], targetHeight: number): MasterVariant {
  if (variants.length === 0) throw new Error('no variants in master playlist')
  const heightOf = (v: MasterVariant) => {
    const m = /x(\d+)$/.exec(v.resolution)
    return m ? Number.parseInt(m[1], 10) : 0
  }
  if (targetHeight > 0) {
    const below = variants.filter((v) => heightOf(v) <= targetHeight)
    if (below.length > 0) return below.reduce((a, b) => (heightOf(a) >= heightOf(b) ? a : b))
  }
  return variants.reduce((a, b) => (a.bandwidth >= b.bandwidth ? a : b))
}

/**
 * 1 episode 分の :class:`KeysArchive` を build する。
 * D1 に保存する側は呼び出し後に Prisma で write する。
 */
export async function buildKeysArchive(
  input: BuildKeysArchiveInput,
  deps: BuildKeysArchiveDeps = { fetchText: defaultFetchText }
): Promise<KeysArchive> {
  const masterUrl = input.masterUrl ?? `https://vod-abematv.akamaized.net/program/${input.programId}/playlist.m3u8`
  const masterText = await deps.fetchText(`${masterUrl}?t=${encodeURIComponent(input.mediaToken)}`)
  const variants = parseMasterPlaylist(masterText, masterUrl)
  const chosen = pickVariant(variants, input.targetHeight ?? 0)

  const variantText = await deps.fetchText(chosen.url)
  const variant = parseVariantPlaylist(variantText, chosen.url)
  if (variant.keys.length === 0 || !variant.keys[0].licenseTicket) {
    throw new Error(`no AES-128 EXT-X-KEY in variant playlist for ${input.programId}`)
  }
  if (variant.keys[0].iv.length !== 16) {
    throw new Error(`unexpected IV length ${variant.keys[0].iv.length}`)
  }

  const session = await getGuestSession()
  const lic = await requestLicense(variant.keys[0].licenseTicket, {
    mediaToken: input.mediaToken,
    bearer: session.token
  })
  const contentKey = await unwrapContentKey(lic.k, lic.cid, input.deviceId ?? session.deviceId)

  return {
    programId: input.programId,
    cid: lic.cid,
    contentKeyHex: bytesToHex(contentKey),
    ivHex: bytesToHex(variant.keys[0].iv),
    variantUrl: chosen.url,
    variantResolution: chosen.resolution,
    variantBandwidth: chosen.bandwidth,
    segmentUrls: variant.segmentUrls,
    createdAt: new Date()
  }
}
