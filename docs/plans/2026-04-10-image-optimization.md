# Work Plan: Image Proxy WebP Optimization (Edge Cache Only)
Date: 2026-04-10
Revised: 2026-04-10 (R2 スコープ削除)

## Goal
`src/routes/img.ts` を単純パススルーから、**WebP 変換 + リサイズ + Cloudflare Edge Cache** の画像最適化エンドポイントにアップグレードする。Crunchyroll 画像配信の軽量化が目的。R2 キャッシュは今回のスコープ外（必要なら後続タスクで追加）。

## Approach
- **エンコーダ**: `wasm-image-optimization` (WASM / libwebp)
- **キャッシュ**: Hono `cache()` middleware で Cloudflare edge cache のみ使用。R2 は使わない
- **API shape**: 既存 `/api/img/:key` (`:key` = original URL の base64url) を維持、`?w=<width>` クエリを追加

## Tasks

### Backend
- [ ] `bun add wasm-image-optimization`
- [ ] `src/routes/img.ts` 書き換え:
  - [ ] base64url key → original URL にデコード
  - [ ] upstream fetch、非 2xx / 非画像 Content-Type は 502
  - [ ] `wasm-image-optimization` で WebP エンコード（`?w` 指定時はリサイズ）
  - [ ] `Content-Type: image/webp`、`Cache-Control: public, max-age=31536000, immutable` で返却
  - [ ] エンコード失敗時は 500（元画像フォールバックはしない）
- [ ] Hono `cache()` middleware の `cacheControl` を `max-age=31536000, immutable` に更新

### Frontend
- [ ] `src/app/components/proxy-image.tsx`:
  - [ ] TODO コメント / 古い `imageKey` import コメントを削除
  - [ ] `ProxyImageProps` に `width?: number` を追加、指定時のみ `?w={width}` をクエリ付与
- [ ] 手動で `/api/img` を組み立てている箇所がないか grep で確認（すべて `ProxyImage` 経由であることを期待）

### QA
- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check --write src/`
- [ ] commit: `feat(img): add webp encoding and resize via wasm`

## Execution Order
1. **Sequential**: Backend 実装 → `bun add`
2. **Parallel**: Frontend の `width` prop 追加（backend 完了を待たず並行可）
3. **Sequential**: QA（型チェック・lint・commit）

## Deliverables
- `src/routes/img.ts`: WebP エンコーダ統合版
- `src/app/components/proxy-image.tsx`: `width` prop 追加、クリーンアップ
- `package.json` / `bun.lock`: `wasm-image-optimization` 追加

## Risks / Notes
- **WASM バンドルサイズ**: ~1-2MB。Workers の 10MB (compressed) 上限には余裕あり、cold start に若干影響
- **CPU 時間**: エンコードで CPU を消費。Workers Paid プラン (30s 制限) 前提
- **Edge cache は Colo 単位**: 別 Colo の初回アクセスは再エンコード発生。全 Colo で共有したければ R2 追加を検討
- **`image-key.ts` は未使用のまま残る**: 今回スコープ外。削除せず、将来の R2 対応時に再利用可能
- **Crunchyroll の `Content-Type`**: upstream が `image/jpeg` などを返すことを前提。稀に `application/octet-stream` で来る場合はフォールバック判定（マジックバイト等）が要るかもしれない → 初版では Content-Type 厳格チェックで割り切る
