/**
 * ABEMA HLS 鍵派生 (TS 移植) のユニットテスト。
 * Python 側 (`nagisa/providers/abema/hls.py`) と完全等価な結果を返すことを
 * fixture (Python で計算済み) との突き合わせで検証する。
 */
import { describe, expect, test } from 'bun:test'
import {
  base58Decode16,
  deriveKek,
  parseLicenseUri,
  parseMasterPlaylist,
  parseVariantPlaylist,
  unwrapContentKey
} from '../../../src/lib/providers/abema/hls'

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')

describe('base58Decode16', () => {
  test('既知ベクトルが Python 実装と一致 (16 bytes 出力)', () => {
    // 0x01 を base58 すると "2"。先頭ゼロ詰めの 16-byte 表現。
    expect(hex(base58Decode16('11111111111111111111112'))).toBe('00000000000000000000000000000001')
  })

  test('無効な文字で例外', () => {
    // 'O', 'I', 'l', '0' は base58 アルファベット外
    expect(() => base58Decode16('invalid_0OIl')).toThrow(/Invalid base58 character/)
  })
})

describe('deriveKek', () => {
  test('Python の derive_kek と完全一致 (固定 fixture)', async () => {
    // Python:
    //   HMAC_KEY (固定) で HMAC-SHA256(cid + device_id) を取った値
    const kek = await deriveKek('test-cid', 'test-device-uuid-xxxxxxxxxxxxxxx')
    expect(hex(kek)).toBe('33773b01e1454118c9b73b3717647b55a3d9d34839abf39b120259186e3a98c7')
  })

  test('入力が違えば結果も違う', async () => {
    const a = await deriveKek('420-78_s1_p5', 'device-A')
    const b = await deriveKek('420-78_s1_p5', 'device-B')
    const c = await deriveKek('420-78_s1_p6', 'device-A')
    expect(hex(a)).not.toBe(hex(b))
    expect(hex(a)).not.toBe(hex(c))
  })
})

describe('unwrapContentKey (WebCrypto AES-CBC で AES-256-ECB をエミュレート)', () => {
  // Python で生成した fixture (`__tests__/abema/test_hls.py` 風の round-trip):
  //   cid = "test-cid", device_id = "test-device-uuid-xxxxxxxxxxxxxxx"
  //   plain = 0102030405060708090a0b0c0d0e0f10
  //   encrypted (= AES-256-ECB(KEK, plain)) を base58 化したもの
  test('Python pycryptodome の AES-256-ECB 復号と完全一致 (fixture 1)', async () => {
    const recovered = await unwrapContentKey('P4za6Y8x7rQjZKMUcCdy4y', 'test-cid', 'test-device-uuid-xxxxxxxxxxxxxxx')
    expect(hex(recovered)).toBe('0102030405060708090a0b0c0d0e0f10')
  })

  test('実 ABEMA license response 風 fixture (16 bytes content key)', async () => {
    const recovered = await unwrapContentKey('4KJRsbaKK3JyBnYyKPLttY', 'test-cid', 'test-device-uuid-xxxxxxxxxxxxxxx')
    expect(hex(recovered)).toBe('81cc1eb417a14ed0259175fcac88b360')
  })
})

describe('parseLicenseUri', () => {
  test('abematv-license:// から base58 ticket を抽出', () => {
    expect(parseLicenseUri('abematv-license://4Gs2aQoaCgXSZRxYMTHTyPiJDEeasMc3hCVngEE5yeyh')).toBe(
      '4Gs2aQoaCgXSZRxYMTHTyPiJDEeasMc3hCVngEE5yeyh'
    )
  })

  test('別スキームは reject', () => {
    expect(() => parseLicenseUri('https://example.com/key')).toThrow(/Not an Abema license URI/)
  })
})

describe('parseMasterPlaylist', () => {
  const MASTER = `#EXTM3U
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=184000,RESOLUTION=320x180
180/playlist.m3u8?aver=1
#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=5300000,RESOLUTION=1920x1080
1080/playlist.m3u8?aver=1
`

  test('variant の bandwidth / resolution / 絶対化された URL を返す', () => {
    const variants = parseMasterPlaylist(MASTER, 'https://vod-abematv.akamaized.net/program/X/playlist.m3u8')
    expect(variants).toHaveLength(2)
    expect(variants[0]).toEqual({
      bandwidth: 184000,
      resolution: '320x180',
      url: 'https://vod-abematv.akamaized.net/program/X/180/playlist.m3u8?aver=1'
    })
    expect(variants[1].bandwidth).toBe(5300000)
  })
})

describe('parseVariantPlaylist', () => {
  const VARIANT = `#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:11
#EXT-X-KEY:METHOD=AES-128,URI="abematv-license://TICKETXYZ",IV=0x362763f3b6cd78ef0ecf621803c4f942
#EXTINF:10.5,
/tsvpg/X/h264/180/seg0.ts
#EXTINF:10.4,
/tsvpg/X/h264/180/seg1.ts
#EXT-X-ENDLIST
`

  test('EXT-X-KEY / segment URLs を絶対化して返す', () => {
    const v = parseVariantPlaylist(VARIANT, 'https://vod-abematv.akamaized.net/program/X/180/playlist.m3u8?aver=1')
    expect(v.targetDuration).toBe(11)
    expect(v.keys).toHaveLength(1)
    expect(v.keys[0].method).toBe('AES-128')
    expect(v.keys[0].licenseTicket).toBe('TICKETXYZ')
    expect(hex(v.keys[0].iv)).toBe('362763f3b6cd78ef0ecf621803c4f942')
    expect(v.segmentUrls).toEqual([
      'https://vod-abematv.akamaized.net/tsvpg/X/h264/180/seg0.ts',
      'https://vod-abematv.akamaized.net/tsvpg/X/h264/180/seg1.ts'
    ])
    expect(v.segmentDurations).toEqual([10.5, 10.4])
  })

  test('EXT-X-KEY METHOD=NONE のとき licenseTicket は空', () => {
    const v = parseVariantPlaylist(
      '#EXTM3U\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:5,\nseg.ts\n',
      'https://example.com/p.m3u8'
    )
    expect(v.keys[0].method).toBe('NONE')
    expect(v.keys[0].licenseTicket).toBe('')
    expect(v.keys[0].iv).toEqual(new Uint8Array(0))
  })
})
