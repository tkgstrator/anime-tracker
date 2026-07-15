# Pywidevine 移行の検討メモ

将来的に Widevine 系 DRM の復号を本プロジェクト内で扱う場合に Pywidevine をどう動かすかを比較したメモ。

**結論: 当面プロジェクト範囲外。** ブラウザ直叩きは CORS で不可、Cloudflare Workers は Crunchyroll 画像配信の都合で US リージョン固定なため、license server (主に JP) との通信レイテンシも考慮するとアーキ的に乗らない。

下記は再評価時の参考。

## Pywidevine が必要とする暗号プリミティブ

| 操作 | 用途 |
|---|---|
| RSA-OAEP-SHA1 | デバイス秘密鍵で session key を復号 |
| AES-128-CBC | license body の復号 |
| AES-128-CTR | コンテンツ復号 |
| HMAC-SHA256 | key/MAC 検証 |
| AES-CMAC | KDF / 署名 (HKDF 風) |

加えて:

- `license_protocol.proto` の protobuf スキーマ
- L3 device の `client_id` (protobuf バイナリ) + RSA 秘密鍵 (Android 端末から抽出する黒い箱)
- MP4 box parse (PSSH 抽出時)

## 移行先 3 案

### 1. TypeScript 移植

| 項目 | 内容 |
|---|---|
| 工数 | 1〜2 週間 |
| 暗号 | WebCrypto + `aes-cmac` (npm) もしくは自前 50 行 |
| protobuf | `protobufjs` か `ts-proto` で `.proto` をコンパイル |
| Workers | 動作 OK (WebCrypto + protobufjs はサポート) |
| ネック | AES-CMAC が WebCrypto にない、デバッグの error メッセージが不親切 |

### 2. Cloudflare Workers Python (Pyodide)

| 項目 | 内容 |
|---|---|
| 工数 | 1〜3 日 (依存解決＋HTTP 書換) |
| 状態 | beta、Cloudflare が curated するパッケージ list あり |
| `cryptography` | Pyodide 自体は対応、Workers curated list 入りは要最新確認 |
| `requests` | ブロック型 HTTP 不可、`js.fetch` 経由に書き換え必須 |
| bundle | 20MB+ になりがち、free tier の 1MB 制限超え |
| コールドスタート | 数百ms〜数秒 |

### 3. AWS Lambda で Pywidevine そのまま

| 項目 | 内容 |
|---|---|
| 工数 | 1 日 |
| 利点 | Python そのまま、デバッグ容易、Lambda Layer に dependency 詰める |
| コスト | ほぼゼロ (リクエスト数依存) |
| 統合 | Workers から SigV4 経由で叩く (既存 `lambda/fetch` と同じ流儀) |

3 案中 **Lambda が圧倒的に低コスト・低リスク**。ただし下記の制約で本プロジェクトには現状不要。

## このプロジェクトに乗らない理由

1. **CORS**: license server (Widevine 系プロバイダ) は通常 origin 制限あり、ブラウザ直叩き不可。Workers / Lambda の中継が必要だが下記の通り別問題あり。
2. **Workers US リージョン固定**: Crunchyroll の画像配信を US Workers で proxy している都合上、license proxy も US から JP の license server に出る。レイテンシ + IP 国判定の問題で license 拒否される可能性高。
3. **Lambda は JP リージョンだが**: 既存 `lambda/fetch` (JP) は anime メタデータ取得用。Widevine 復号は別職務で、責務分離した方がよい。

## 再評価のトリガー条件

下記が満たされたときに再検討する:

- Crunchyroll 画像 proxy を別経路に切り出し、Workers JP リージョンが選べる
- もしくは license proxy 専用 Lambda を立てる需要が生まれる (例: 録画フローで暗号化セグメントを直接扱う必要が出る)
- もしくはユーザーが自分のデバイスで CDM を動かす方式に切り替え (ブラウザ拡張 / ネイティブアプリ経由)

## 参考実装

- Pywidevine 本家: https://github.com/devine-dl/pywidevine
- 既存 TS 移植 (パーシャル多し): GitHub `node-widevine`, `widevine.js` 等
- Pyodide 対応状況: https://pyodide.org/en/stable/usage/packages-in-pyodide.html
- Cloudflare Python Workers: https://developers.cloudflare.com/workers/languages/python/
