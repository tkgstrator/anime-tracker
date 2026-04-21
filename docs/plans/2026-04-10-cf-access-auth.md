# Work Plan: Cloudflare Access 認証でミューテーション保護

Date: 2026-04-10

## Goal

Cloudflare Access によるログイン認証を導入し、ログイン済みユーザーのみが「録画予約」「録画する」等のミューテーション系ボタンを押下できるようにする。閲覧系 (GET) は引き続き匿名で利用可能。

## Architecture Summary

- **認証方式**: Cloudflare Access の JWT (`Cf-Access-Jwt-Assertion` ヘッダ) を Hono ミドルウェアで検証
- **公開鍵**: `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` を KV キャッシュ（TTL 1h）
- **ID 取得**: `GET /api/auth/me` が email を返す（未認証時 401）
- **ログイン/ログアウト**: `/cdn-cgi/access/login?redirect_url=...` / `/cdn-cgi/access/logout`
- **ローカル dev**: `CF_ACCESS_TEAM_DOMAIN` 未設定時は bypass

## Tasks

### Backend
- [ ] `src/schemas/auth.dto.ts` に `CurrentUserSchema` / `AuthErrorSchema` を追加
- [ ] `src/middleware/cf-access.ts` を新規作成（Web Crypto で JWT/JWKS 検証、KV キャッシュ、dev bypass）
- [ ] `src/routes/auth.ts` を新規作成（`GET /api/auth/me`）
- [ ] `src/routes/recordings.ts` のミューテーション (`PUT /`, `PUT /bulk`) にミドルウェアを適用
- [ ] `src/routes/anime.ts` のミューテーション (`PATCH /:id`, `POST /:id/record` 等) にミドルウェアを適用
- [ ] `src/index.ts` の `Bindings` に `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` を追加し `authRoutes` を登録
- [ ] `wrangler.jsonc` の `vars`（各 env）に `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` を追記
- [ ] `/api/queues` は内部エンドポイントのため対象外とする（既存のまま）

### Frontend
- [ ] `src/app/lib/api.ts` Zodios クライアントに `getCurrentUser` エンドポイントを追加
- [ ] `src/app/hooks/use-current-user.ts` を新規作成（401 を `null` 扱い、`staleTime: 60s`）
- [ ] `src/app/components/auth-button.tsx` を新規作成（ログイン/ログアウト + email 表示）
- [ ] `src/app/routes/__root.tsx` のヘッダ `<ServerStatusDialog />` の隣に `<AuthButton />` を挿入
- [ ] `src/app/routes/anime/$id/-components/anime-hero.tsx` の録画系ボタンを未認証時 disabled + Tooltip "ログインが必要です"、クリック時は Access login へリダイレクト
- [ ] `src/app/lib/query-client.ts` でミューテーション 401 を検知し Access login にリダイレクト

### QA
- [ ] `bunx tsc -b --noEmit`
- [ ] `bunx biome check src/`
- [ ] commitlint 形式でコミット

## Execution Order

1. **Sequential**: Schema 定義 (`src/schemas/auth.dto.ts`) — 他すべての前提
2. **Parallel**: Backend ミドルウェア/ルート & Frontend hook/UI
3. **Sequential**: QA → commit

## Deliverables

- `src/schemas/auth.dto.ts` — Zod スキーマ
- `src/middleware/cf-access.ts` — JWT 検証ミドルウェア
- `src/routes/auth.ts` — `/api/auth/me`
- `src/app/hooks/use-current-user.ts` — 認証状態フック
- `src/app/components/auth-button.tsx` — ヘッダ UI
- 既存ファイル更新: `src/index.ts`, `src/routes/recordings.ts`, `src/routes/anime.ts`, `src/app/routes/__root.tsx`, `src/app/routes/anime/$id/-components/anime-hero.tsx`, `src/app/lib/api.ts`, `src/app/lib/query-client.ts`, `wrangler.jsonc`

## Risks / Notes

- **ローカル dev で JWT が注入されない**: `CF_ACCESS_TEAM_DOMAIN` 未設定時に bypass する分岐を middleware に入れる。本番/staging では必ず値を設定する運用。
- **AUD タグは env ごとに異なる**: staging / production の各 `wrangler.jsonc` env ブロックに個別の `CF_ACCESS_AUD` を設定する必要あり。
- **JWKS ローテーション**: KV キャッシュ TTL 1h。検証失敗時は live fetch にフォールバックしてから reject。
- **`/api/auth/me` 自体は CF Access で保護しない**: Worker 側で 401 を返す必要がある。Cloudflare ダッシュボードの Access Application パス設定から除外すること。
- **既存 `/admin/*`**: インフラ層 CF Access で保護済み・アプリ側対応不要（現状維持）。
- **テスト**: e2e は wrangler dev で bypass モードで動作するため影響なし。
