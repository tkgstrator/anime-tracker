# Amazon Prime Video ブラウズAPI

## 参照URL

Prime Video - アニメTV新着順
https://www.amazon.co.jp/gp/video/browse/ref=atv_unknown?serviceToken=v0_Cl0KJDE0YjM4MzEyLTVkOGItNDY0Zi1iZGExLWZjMTI4ODRiNTFmMRCQ2LCL0zMaLDR6R2Vsa3lyWVVHSW9CcTNmUlJKK1U4V0c0TWluS0RsbGtXRXdBYmtCMG89IAESBmZpbHRlchgBMgZjZW50ZXI6BnNlYXJjaHoAggG_BBrsA3Bfbl90aGVtZV9icm93c2UtYmluPTQ0MzU1MjQwNTEmaXNfbW92aWVfY29sbGVjdGlvbj0wLDAsMCwwJnNvcnQ9LXByaW1lX3ZpZGVvX3N0YXJ0X2RhdGUmZmllbGQtd2F5c190b193YXRjaD0zNzQ2MzMwMDUxJnBfbl9lbnRpdHlfdHlwZT00MTc0MDk5MDUxJnNlYXJjaC1hbGlhcz1pbnN0YW50LXZpZGVvJmJxPShhbmQgKGFuZCAoYW5kIChhbmQgKG9yIGdlbnJlOidhdl9nZW5yZV9hbmltZScgZ2VucmU6J2F2X3N1YmdlbnJlX2FuaW1lKicpIChub3QgZW50aXR5X3R5cGU6J1Byb21vdGlvbnxUcmFpbGVyfEJvbnVzIENvbnRlbnQnKSkgKG5vdCBlbnRpdHlfdHlwZTonUHJvbW90aW9ufFRyYWlsZXJ8Qm9udXMgQ29udGVudCcpKSAobm90IGVudGl0eV90eXBlOidQcm9tb3Rpb258VHJhaWxlcnxCb251cyBDb250ZW50JykpIChub3QgZW50aXR5X3R5cGU6J1Byb21vdGlvbnxUcmFpbGVyfEJvbnVzIENvbnRlbnQnKSkmcF9uX3dheXNfdG9fd2F0Y2g9Mzc0NjMyODA1MSILUHJpbWUgVmlkZW8qFOOCouODi-ODoVRW5paw552A6aCGMAA6JXsic2JzaW4iOjAsImN1cnNpemUiOjE2MCwicHJlc2l6ZSI6MH1QAHAA

もうすぐ配信終了
https://www.amazon.co.jp/gp/video/browse/ref=atv_unknown?serviceToken=v0_Cl0KJDNmOThhNzY1LTBhMWEtNDdkOS04ZDI1LTNmYjkzMDFjZDVmMBCAq6WL0zMaLDR6R2Vsa3lyWVVHSW9CcTNmUlJKK1U4V0c0TWluS0RsbGtXRXdBYmtCMG89IAESBmZpbHRlchgBMgZjZW50ZXI6BnNlYXJjaHoAggHIAhr_AW5vZGU9NDIxNzUyMDA1MSZwX25fdGhlbWVfYnJvd3NlLWJpbj00NDM1NTI0MDUxJmlzX21vdmllX2NvbGxlY3Rpb249MCwwJnBfbl93YXlzX3RvX3dhdGNoPTM3NDYzMjgwNTEmc2VhcmNoLWFsaWFzPWluc3RhbnQtdmlkZW8mYnE9KGFuZCAobm90IGVudGl0eV90eXBlOidQcm9tb3Rpb258VHJhaWxlcnxCb251cyBDb250ZW50JykgKG5vdCBlbnRpdHlfdHlwZTonUHJvbW90aW9ufFRyYWlsZXJ8Qm9udXMgQ29udGVudCcpKSZiYm49NDIxNzUyMDA1MSIY44KC44GG44GZ44GQ6YWN5L-h57WC5LqGMAA6JHsic2JzaW4iOjAsImN1cnNpemUiOjk2LCJwcmVzaXplIjowfVAAcAA%3D

## エンティティのメッセージフィールド (2026-03-28 時点)

### titleMetadataBadge.message

タイトルカードの左上に表示されるバッジ。Enum 候補として利用可能。

| 値 | 意味 | 出現頻度 |
|----|------|----------|
| `セール` | 期間限定セール中 | 多 |
| `新エピソード` | 新しいエピソードが追加された | 中 |
| `新着` | 新規配信開始 | 中 |
| `新作` | 新作タイトル | 少 |
| `人気上昇中` | 視聴数が急上昇中 | 少 |

APIのパラメータでバッジ種別を絞り込むことはできない。
取得後にクライアント側でフィルタする必要がある。

### highValueMessage.message

タイトルカードに表示される補足情報。自由文で、以下のパターンがある。

**配信終了系** — `parseExpiringMessage()` でパース可能
- `シーズンNの{サービス名}での配信はN日以内に終了`
- `{サービス名}での配信はN日以内に終了`
- `シーズンNの{サービス名}での配信はN時間以内に終了`
- `シーズンNの{サービス名}での配信はN時間N分以内に終了`

サービス名: `Prime` / `アニメタイムズ` / `dアニメストア for Prime Video` / `FODチャンネル for Prime Video`

**ランキング系**
- `#N 日本` — 総合ランキング
- `トップ10にN週間ランクイン`
- `{ジャンル}のTV番組で第N位`
- `{ジャンル}の映画で第N位`

**新エピソード通知**
- `新しいエピソード{曜日}`

**受賞歴**
- `{賞名}にノミネートされています`
- `{賞名}を受賞しています`

空文字 `""` が返ることが多い（バッジなしのタイトル）。
スキーマ側で空文字は `undefined` に変換済み。

### TODO

- [ ] `TitleSchema.hasNewContent` (boolean) をバッジの Enum 値に変更する
  - 候補: `セール` / `新エピソード` / `新着` / `新作` / `人気上昇中` / null
  - `sync.ts` 等の参照箇所も合わせて修正が必要
