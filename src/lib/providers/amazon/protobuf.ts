/**
 * Prime Video の serviceToken 用 protobuf を手動エンコードするヘルパー。
 *
 * 元の構造 (protobuf フィールド):
 *   field  2 (string): "query"
 *   field  3 (varint): 1
 *   field  5 (string): "default"
 *   field  6 (string): "center"
 *   field  7 (string): "search"
 *   field 15 (string): ""
 *   field 16 (bytes) : nested message {
 *     field  3 (string): URL query params
 *     field  4 (string): keyword
 *     field  6 (varint): 0
 *     field 10 (varint): 0
 *     field 14 (varint): 0
 *   }
 */

const textEncoder = new TextEncoder()

/**
 * 数値を protobuf varint エンコーディングでバイト列に変換する。
 * @param value - エンコード対象の非負整数
 * @returns varint エンコードされたバイト配列
 */
export function encodeVarint(value: number): number[] {
  const bytes: number[] = []
  let v = value
  while (v > 0x7f) {
    bytes.push((v & 0x7f) | 0x80)
    v >>>= 7
  }
  bytes.push(v & 0x7f)
  return bytes
}

/**
 * protobuf フィールドのタグ (フィールド番号 + ワイヤータイプ) をエンコードする。
 * @param fieldNumber - フィールド番号
 * @param wireType - ワイヤータイプ (0=varint, 2=length-delimited)
 * @returns タグのバイト配列
 */
export function encodeTag(fieldNumber: number, wireType: number): number[] {
  return encodeVarint((fieldNumber << 3) | wireType)
}

/**
 * protobuf の length-delimited string フィールドをエンコードする。
 * @param fieldNumber - フィールド番号
 * @param value - エンコードする文字列
 * @returns タグ + 長さ + UTF-8 バイト列の配列
 */
export function encodeString(fieldNumber: number, value: string): number[] {
  const encoded = textEncoder.encode(value)
  return [...encodeTag(fieldNumber, 2), ...encodeVarint(encoded.length), ...encoded]
}

/**
 * protobuf の varint フィールドをエンコードする。
 * @param fieldNumber - フィールド番号
 * @param value - エンコードする数値
 * @returns タグ + varint のバイト配列
 */
export function encodeVarintField(fieldNumber: number, value: number): number[] {
  return [...encodeTag(fieldNumber, 0), ...encodeVarint(value)]
}

/**
 * protobuf の length-delimited bytes フィールドをエンコードする。
 * @param fieldNumber - フィールド番号
 * @param value - エンコードするバイト配列
 * @returns タグ + 長さ + バイト列の配列
 */
export function encodeBytes(fieldNumber: number, value: number[]): number[] {
  return [...encodeTag(fieldNumber, 2), ...encodeVarint(value.length), ...value]
}
