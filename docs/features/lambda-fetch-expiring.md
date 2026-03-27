# 配信終了タイトル取得の AWS Lambda 移行

## 背景

Amazon Prime Video のブラウズページは、日本国外の IP からアクセスすると `highValueMessage`（配信終了メッセージ）が返らない。

- Cloudflare Workers: リージョン指定不可（Queue/Cron Trigger は Smart Placement 対象外）→ 503 or メッセージ欠落
- GitHub Actions: runner が米国リージョン → 503

**解決策**: AWS Lambda を `ap-northeast-1`（東京）で実行し、日本 IP からの fetch を保証する。

## 現行フロー

```
GitHub Actions (米国IP) → Amazon fetch → 503 エラー
```

## 提案フロー

```
EventBridge Scheduler (cron: 0 15 * * *)
  → Lambda (ap-northeast-1, Node.js 24)
    → Amazon Prime Video fetch (日本IP)
    → expiredAt 計算
    → Cloudflare KV REST API で保存
```

Workers 側は変更なし — KV から読み取って DB 更新する既存フローがそのまま動く。

## 前提条件

- AWS アカウント（既存）
- Cloudflare API Token（KV 書き込み権限）
- Terraform CLI インストール済み
- R2 バケット（Terraform state 管理用）

## フェーズ一覧

### Phase 1: Terraform 基盤セットアップ

1. `infra/` ディレクトリ作成
2. Terraform backend を Cloudflare R2 で構成（S3 互換）
3. `.gitignore` に Terraform 関連ファイルを追加（`.terraform/`, `*.tfstate*`）
4. AWS provider 設定（`ap-northeast-1`）

**成果物**:
- `infra/main.tf` — provider, backend
- `infra/variables.tf` — 変数定義
- `.gitignore` 更新

### Phase 2: Lambda 関数の実装

1. `lambda/fetch-expiring/` ディレクトリ作成
2. Lambda ハンドラ実装（`index.ts`）
   - 既存の `AmazonProvider.fetchTitleList({ expiringOnly: true })` を再利用
   - `Bun.write()` → 不要（KV REST API で直接書き込み）
   - `wrangler kv key put` → Cloudflare KV REST API（`fetch`）に置換
   - `expiredAt` 計算ロジックは `scripts/fetch-expiring.ts` から移植
3. `bun build --target=node` でバンドル
   - エントリポイント: `lambda/fetch-expiring/index.ts`
   - 出力: `lambda/fetch-expiring/dist/index.mjs`
   - 単一ファイルにバンドル（`node_modules` 不要）

**Bun 固有 API の置換**:
| 現行 (`scripts/fetch-expiring.ts`) | Lambda 版 |
|-------------------------------------|-----------|
| `Bun.write(tmpFile, json)` | 不要（REST API で直接送信） |
| `execSync('bunx wrangler ...')` | `fetch()` で Cloudflare KV API を呼び出し |

**KV REST API**:
```
PUT https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}
Authorization: Bearer {api_token}
Content-Type: application/json

{ "fetchedAt": "...", "entries": [...] }
```

**成果物**:
- `lambda/fetch-expiring/index.ts` — ハンドラ
- `lambda/fetch-expiring/build.ts` — ビルドスクリプト

### Phase 3: Terraform で Lambda リソース定義

1. IAM Role（Lambda 実行用、基本ログ権限のみ）
2. Lambda 関数
   - Runtime: `nodejs24.x`
   - Architecture: `arm64`（Graviton、コスト最適）
   - Memory: 256MB
   - Timeout: 60 秒
   - 環境変数: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `KV_NAMESPACE_ID`
3. CloudWatch Logs（Lambda 自動作成）

**成果物**:
- `infra/lambda.tf` — Lambda + IAM

### Phase 4: EventBridge Scheduler 定義

1. EventBridge Scheduler ルール
   - cron: `cron(0 15 * * ? *)` — 毎日 UTC 15:00（JST 00:00）
   - ターゲット: Lambda 関数
2. Scheduler 用 IAM Role

**成果物**:
- `infra/scheduler.tf` — EventBridge + IAM

### Phase 5: ビルド・デプロイパイプライン

1. `package.json` にスクリプト追加
   - `lambda:build` — `bun build --target=node` でバンドル
   - `lambda:deploy` — `terraform apply`
2. GitHub Actions ワークフロー更新
   - `fetch_expiring.yaml` を削除（Lambda に移行済み）
   - 必要に応じて `terraform plan` を CI に追加（任意）

**成果物**:
- `package.json` 更新
- `.github/workflows/fetch_expiring.yaml` 削除

### Phase 6: Terraform state 用 R2 バケット準備

1. R2 バケット作成（手動 or wrangler）
   - バケット名: `terraform-state`（例）
2. R2 API トークン発行（S3 互換アクセス用）
3. backend 設定に R2 エンドポイント記載

**注意**: R2 バケット自体は Terraform 管理外（鶏と卵問題のため手動作成）

**成果物**:
- R2 バケット（手動）
- `infra/main.tf` の backend 設定確定

### Phase 7: デプロイ・動作確認

1. `terraform init` — backend 初期化
2. `terraform plan` — 差分確認
3. `terraform apply` — リソース作成
4. Lambda テスト実行（AWS Console or CLI）
5. KV にデータが保存されることを確認
6. Workers 側で `fetchExpiring()` が KV データを読めることを確認

### Phase 8: クリーンアップ

1. `.github/workflows/fetch_expiring.yaml` 削除
2. `scripts/fetch-expiring.ts` 削除（Lambda に移行済み）
3. ドキュメント更新
   - `docs/features/github-actions-fetch.md` に Lambda 移行の旨を追記
   - `docs/ROADMAP.md` 更新（該当あれば）

## 推奨実行順序

Phase 6（R2 バケット準備）→ Phase 1 → Phase 2 → Phase 3 → Phase 4 → Phase 5 → Phase 7 → Phase 8

Phase 6 が最初に必要（Terraform backend の依存）。Phase 2（Lambda コード）と Phase 3-4（Terraform 定義）は並行作業可能。

## コスト見積もり

| リソース | 月間利用 | コスト |
|----------|----------|--------|
| Lambda | 30 回/月 × ~10 秒 × 256MB | 無料枠内 |
| EventBridge Scheduler | 30 回/月 | 無料枠内 |
| CloudWatch Logs | ~1KB/回 | 無料枠内 |
| R2 (state) | ~1 ファイル | 無料枠内 |

## ディレクトリ構成（完成時）

```
infra/
  main.tf              # provider, backend (R2)
  variables.tf         # 変数定義
  lambda.tf            # Lambda + IAM
  scheduler.tf         # EventBridge + IAM
lambda/
  fetch-expiring/
    index.ts           # ハンドラ（Bun で記述）
    build.ts           # bun build スクリプト
    dist/
      index.mjs        # バンドル済み（git 管理外）
```

## 必要な Secrets / 環境変数

| 名前 | 用途 | 保存先 |
|------|------|--------|
| `CLOUDFLARE_API_TOKEN` | KV 書き込み | Lambda 環境変数 |
| `CLOUDFLARE_ACCOUNT_ID` | KV API | Lambda 環境変数 |
| `KV_NAMESPACE_ID` | KV namespace 指定 | Lambda 環境変数 |
| `AWS_ACCESS_KEY_ID` | Terraform / deploy | ローカル `~/.aws/credentials` |
| `AWS_SECRET_ACCESS_KEY` | Terraform / deploy | ローカル `~/.aws/credentials` |
| `R2_ACCESS_KEY_ID` | Terraform state backend | ローカル環境変数 |
| `R2_SECRET_ACCESS_KEY` | Terraform state backend | ローカル環境変数 |
