---
title: nagisa-webui/infra/ の Lambda 定義を本 IaC repo に集約する
description: 現状 nagisa-webui 側で分散管理されている AWS Lambda (anime-tracker-fetch, anime-tracker-fetch-us, Bun ランタイム Layer 等) を本 IaC repo の services/aws/lambda/ に一元化。ソースは submodule 経由で参照。container 化は Phase 2 に切り出し
author: claude-opus-4-7
created: 2026-07-15
updated: 2026-07-15
---

# nagisa-webui/infra/ の Lambda 定義を本 IaC repo に集約する

**移行元:** `nagisa-webui` repo の `infra/` (terraform root) と `lambda/` (関数ソース + layer)
**移行先:** 本 IaC repo (`qtmleap/infra`) の `services/aws/lambda/`
**視点:** 本 IaC repo が nagisa-webui の Lambda インフラを **引き取る**。ソースは submodule で参照する。

---

## 0. 前提と方針

- 本 IaC repo が **terraform (Lambda / IAM / Function URL / Cloudflare Workers secret) と state** を保持する。
- nagisa-webui は **Worker 本体 + Lambda 関数ソース + ビルドスクリプト** を保持し続ける（言い換えると Lambda ハンドラの実装場所は変わらない）。
- 本 IaC repo は **nagisa-webui を git submodule として取り込み**、`terraform apply` 直前に build して生成された ZIP を参照する。
- Worker 呼び出し経路 (`nagisa-webui/src/lib/lambda.ts` の SigV4 → Function URL) は **一切変更しない**。挙動不変が絶対条件。
- `LambdaInvoker` IAM ユーザーのアクセスキー値は、state 移行中も本移行後も **同一の apply 内で `cloudflare_workers_secret` に流し込む**。手動 `wrangler secret put` は廃止。
- **container 化 (ECR + `image_uri`) は本計画の範囲外。**Phase 2 として末尾で言及するのみ。

---

## 1. 責務分割（Split of Responsibilities）

### nagisa-webui 側に残すもの

| 種別 | パス（nagisa-webui repo 内） | 備考 |
|---|---|---|
| Lambda ハンドラ本体 | `lambda/fetch/index.ts` | 変更なし |
| バンドルスクリプト | `lambda/fetch/build.ts` | 変更なし。生成物 `dist/function.zip` は git ignore のまま |
| 呼び出しユーティリティ | `scripts/lambda/{invoke.sh,local.ts,count.ts,README.md}` | 変更なし。README のみ更新（後述 §7） |
| Worker 側 | `src/lib/lambda.ts`, `src/index.ts`, `src/queue.ts`, `wrangler.toml` の `LAMBDA_FUNCTION_URL[_US]` | 変更なし |
| ローカル dev secret | `.dev.vars` の `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | `wrangler dev` が消費するため残す。値の入手経路のみ変更（infra 側 `terraform output -raw` から手動貼り付け） |

### 本 IaC repo (`services/aws/lambda/`) が引き取るもの

| 種別 | nagisa-webui 側の現在の場所 | infra 側の配置 | 備考 |
|---|---|---|---|
| terraform root | `nagisa-webui/infra/{main.tf, variables.tf, lambda.tf}` | `services/aws/lambda/{main.tf, variables.tf, lambda.tf, layers.tf, worker_secrets.tf}` | backend key を `aws/lambda/terraform.tfstate` に変更。provider は infra 既存流儀 (`aws_region`, `aws_profile`) に統一 |
| `aws_iam_role.lambda_exec` / `.lambda_exec_us` | `infra/lambda.tf` | `services/aws/lambda/lambda.tf` | AWS リソース名 (`anime-tracker-lambda[_us]`) は変えない |
| `aws_lambda_function.fetch` / `.fetch_us` | 同上 | 同上 | AWS 関数名 (`anime-tracker-fetch[_us]`) は変えない。`filename` を submodule 経由の相対パスに書き換え（§2） |
| `aws_lambda_layer_version.bun_runtime` | 同上 | `services/aws/lambda/layers.tf` | `filename` を `${path.module}/layers/bun-runtime/bun-runtime.zip` に |
| Bun runtime layer 実体 + 再ビルド手順 | `nagisa-webui/lambda/layers/bun-runtime.zip` | `services/aws/lambda/layers/bun-runtime/{bun-runtime.zip,build.sh,README.md}` | **nagisa-webui 固有ではなく汎用 layer** として infra が所有。§1.5 参照 |
| `aws_lambda_function_url.fetch` / `.fetch_us` | 同上 | `services/aws/lambda/lambda.tf` | URL は不変（既存 state をそのまま流し込むため） |
| `aws_iam_user.lambda_invoker` + `aws_iam_access_key.lambda_invoker` + 2 本の inline policy | 同上 | 同上 | **key value は state push で保持**（再発行しない）。参照先は下記 `cloudflare_workers_secret` |
| `cloudflare_workers_secret.aws_access_key_id_{staging,production}` / `.aws_secret_access_key_{staging,production}`（新規、計 4 リソース） | — | `services/aws/lambda/worker_secrets.tf` | 値は `aws_iam_access_key.lambda_invoker.id` / `.secret` を参照。Worker script 名は infra 側で `worker_scripts` 変数として持つ（§4） |
| terraform 変数 | `infra/variables.tf` の `r2_image_*`, `r2_account_id` | `services/aws/lambda/variables.tf` に prefix 付きで移設（例 `nagisa_r2_image_*`） | Lambda 環境変数として渡される |
| nagisa-webui 全体 | — | `services/aws/lambda/vendor/nagisa-webui/`（submodule） | Fable 判断: `vendor/` prefix にすると infra 側から見て「外部由来コード」として明快 |

### nagisa-webui 側から削除するもの

- `infra/` ディレクトリ丸ごと（`.terraform/` のローカルキャッシュ含む）
- `lambda/layers/bun-runtime.zip` および `lambda/layers/` ディレクトリ（infra 側にコピー済み）
- `package.json` の `deploy:lambda` スクリプト（後述 §6 で解消）
- `.env` の `R2_STATE_*` / `TF_VAR_r2_image_*`（terraform を持たなくなるため）
- `CLAUDE.md` の terraform + AWS provider 節（後述 §7 で書き直し）
- **`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を wrangler secret に手動 put する運用**（本移行後は infra 側 `cloudflare_workers_secret` が唯一の投入経路）。`scripts/cloudflare/set-secrets.sh` 自体は他 secret 投入で使い続ける

---

## 1.5. Bun runtime layer の infra 側管理

`bun-runtime.zip` は Crunchyroll の TLS fingerprint 対策として `provided.al2023` カスタムランタイム上に Bun を載せるレイヤ。**nagisa-webui 固有ではなく汎用インフラ資産**（他の Crunchyroll 系 / TLS 制約系プロジェクトでも再利用しうる）なので、本 IaC repo にオーナーシップごと持たせる。

### 配置

```
services/aws/lambda/
├── main.tf
├── variables.tf
├── lambda.tf                    # 関数群 + IAM
├── layers.tf                    # aws_lambda_layer_version.bun_runtime
├── worker_secrets.tf            # cloudflare_workers_secret × 4
├── Makefile                     # build/plan/apply エントリ
├── layers/
│   └── bun-runtime/
│       ├── bun-runtime.zip      # 現行 ZIP を初回そのままコピー
│       ├── build.sh             # 再ビルド手順（Phase 1 完了後の別タスク）
│       └── README.md            # 由来・Bun バージョン・SHA256・使い方
└── vendor/
    └── nagisa-webui/            # git submodule
```

- `aws_lambda_layer_version.bun_runtime` は `layers.tf` に置き、`filename = "${path.module}/layers/bun-runtime/bun-runtime.zip"`。
- **共有 layer として設計**: 同じ root 内に将来別関数を追加するとき `layers = [aws_lambda_layer_version.bun_runtime.arn]` で参照するだけで使い回せる。`layers/bun-runtime/README.md` に「これは共有レイヤ。`anime-tracker-fetch-us` が現在の唯一の消費者だが他関数も参照可」と明記。

### 再ビルド手順（骨組みのみ、詳細整備は本 Phase 1 完了後の別タスク）

現状 `bun-runtime.zip` の中身の由来（Bun バージョン・bootstrap スクリプト・ZIP 化手順）が nagisa-webui のどこにも記録されていない。**初回移行では既存 ZIP をバイナリコピーで持ち込み、`source_code_hash` を変えないことを最優先**。build.sh 整備は Phase 1 完了後に infra 側で独立タスクとして片付ける。

`build.sh` 最小要件（infra 側で最終決定）:

- 対象 Bun バージョンをピン（例 `BUN_VERSION=1.x.y`）
- AWS Lambda `provided.al2023` runtime interface に沿った `bootstrap` スクリプト同梱
- arm64 バイナリの取得（`bun-linux-aarch64.zip` 相当）
- 依存を ZIP 化し `bun-runtime.zip` を生成
- SHA256 を README にログして `source_code_hash` の差分理由を追跡可能に

---

## 2. アーティファクト参照方式（git submodule）

Lambda ハンドラのソースは nagisa-webui にあり、`terraform apply` は本 IaC repo で走る。両者を繋ぐ手段として **nagisa-webui を submodule として本 IaC repo に取り込む** 方針とする。

### なぜ submodule か

R2 バケット経由・GitHub Release・手動コピー等を比較した結果、submodule が本プロジェクトの制約に最も合致すると判断した。

| 方式 | 判定 | 主要理由 |
|---|---|---|
| **git submodule（採用）** | ○ | R2 バケット / publish スクリプト / 追加認証すべて不要。コミット SHA でバージョン一意。infra 側 review で diff が見える。devcontainer で bun install も自然 |
| R2 バケット + 手動 publish | × | 追加バケット・認証・スクリプトが必要でオペ複雑化。SHA トレースが sidecar file 経由になる |
| GitHub Release | × | CI 前提。現状 nagisa-webui の `.github/workflows/deployment.yaml` は Worker deploy のみで Lambda 用 CI は無い |
| 手動ローカルコピー | × | 属人化。source_code_hash 更新忘れリスク |
| GHA reusable workflow | × | CI パイプライン新設が前提。スコープ外 |

### 具体形

1. 本 IaC repo に nagisa-webui を submodule として追加:
   ```sh
   git -C <infra repo root> submodule add https://github.com/qtmleap/nagisa-webui.git services/aws/lambda/vendor/nagisa-webui
   ```
   （リモート URL は実際のものに合わせる。private repo なら SSH URL。）
2. terraform 側は ZIP をローカルファイル参照。`aws_lambda_function.fetch` / `.fetch_us` の `filename`:
   ```hcl
   filename         = "${path.module}/vendor/nagisa-webui/lambda/fetch/dist/function.zip"
   source_code_hash = filebase64sha256("${path.module}/vendor/nagisa-webui/lambda/fetch/dist/function.zip")
   ```
3. `services/aws/lambda/Makefile`（新規）で apply 前手順を固める:
   ```make
   .PHONY: build apply plan

   build:
   	cd vendor/nagisa-webui && bun install --frozen-lockfile && bun run lambda/fetch/build.ts

   plan: build
   	terraform plan

   apply: build
   	terraform apply
   ```
4. submodule 更新は明示的に:
   ```sh
   git submodule update --remote services/aws/lambda/vendor/nagisa-webui
   ```
   これで追跡ブランチ（`master` 想定）の最新を pull する。apply 前の運用ルール:
   1. `git submodule update --remote ...` で最新化 → commit（infra 側で「nagisa-webui を <SHA> に更新」というコミットが残る）
   2. `make plan` で内容確認（ZIP hash 差分 = Lambda 更新）
   3. `make apply`

### submodule 運用のルール

- **初期化**: infra リポを clone した直後、または他人の update を pull した後は必ず:
  ```sh
  git submodule update --init --recursive
  ```
  README で明記。
- **追跡ブランチ**: `.gitmodules` で `branch = master` を明示（`git submodule update --remote` が拾う参照を固定）。
- **無承認 update の禁止**: submodule の SHA 更新は Lambda 関数のコード変更に相当する。infra 側でも review 対象（PR 必須）。

### Worker script 名の取り出し

nagisa-webui の `wrangler.toml` から Worker script 名（staging/production）を人間が読み取って `variables.tf` に入れる。**submodule で infra 側から nagisa-webui/wrangler.toml が読める**ので、自動抽出も一応可能:

- 選択肢 A（推奨・シンプル）: **手動で `variables.tf` に hardcode**。Worker 名はほぼ変わらないため、変わった時だけ人間が更新すればよい。plan diff で気付ける。
- 選択肢 B: `data "external"` provider や TOML parser 相当を使って自動抽出。可能だが複雑さの割にメリットが薄い（Worker 名は年に 1 度も変わらない）。

推奨: A（手動 hardcode）+ README で「wrangler.toml の script 名を変えたら infra 側 `variables.tf` も更新」と注記。

---

## 3. Terraform state 移行

現在の state: R2 バケット `terraform-state` / key `anime-tracker/terraform.tfstate`
移行先: 同バケット / key `aws/lambda/terraform.tfstate`（本 IaC repo の既存慣習に合致）

含まれるライブリソース（消えたら本番 impact）:
- `aws_lambda_function.fetch` / `.fetch_us`
- `aws_lambda_function_url.fetch` / `.fetch_us`（**URL の再発行 = nagisa-webui/wrangler.toml のハードコード URL 破壊**）
- `aws_iam_user.lambda_invoker` + `aws_iam_access_key.lambda_invoker`（**再生成 = Worker 全停止**）
- `aws_iam_role.lambda_exec` / `.lambda_exec_us`
- `aws_lambda_layer_version.bun_runtime`

### 推奨: `terraform state pull` → `terraform state push` の丸ごと引っ越し

`terraform import` を 10+ 個手で書くよりミスが少ない。`moved` ブロックは同一 state 内リファクタ用で、別 state 間の引っ越しには使えない。

### 手順

1. **バックアップ**: nagisa-webui で `source .env && terraform -chdir=infra state pull > ~/backups/nagisa-webui.tfstate.$(date +%Y%m%d-%H%M%S).bak`。別ホストにも退避。
2. 本 IaC repo `services/aws/lambda/` に `main.tf`, `variables.tf`, `lambda.tf`, `layers.tf` を配置。**リソースアドレスは現状と完全一致**（`aws_lambda_function.fetch` のまま）。アドレスが変わると state push 後に「差分あり」扱いになる。
3. submodule を追加し、`make build` で `vendor/nagisa-webui/lambda/fetch/dist/function.zip` を生成。SHA256 が「nagisa-webui/infra から見たときの旧 ZIP」と bit-exact 一致することを確認（bun build は基本決定的だが確証がないので、ここは実測で担保する）。
4. layer ZIP を `nagisa-webui/lambda/layers/bun-runtime.zip` から `services/aws/lambda/layers/bun-runtime/bun-runtime.zip` にバイナリコピー。SHA256 を README に記録。
5. `terraform -chdir=services/aws/lambda init -reconfigure -backend-config="access_key=$AWS_ACCESS_KEY_ID" -backend-config="secret_key=$AWS_SECRET_ACCESS_KEY"`（infra 慣習で `AWS_*` env が R2 backend キー）。
6. **dry-run**: `terraform plan` → 全リソースが `will be created` で出るはず（新 state は空）。**apply しない**。
7. `terraform state push ~/backups/nagisa-webui.tfstate.<ts>.bak`。
8. 再度 `terraform plan` → **`No changes.` を確認**。差分が出た場合の疑い順: (a) リソースアドレス不一致、(b) ZIP パス変更で source_code_hash 差、(c) provider version 差。
9. 旧 state ファイル（R2 上の `anime-tracker/terraform.tfstate`）は **まだ削除しない**。数日運用後に削除（rollback 保険）。

### Rollback

- 万一 infra 側 apply が壊れたら、nagisa-webui/infra/ を復元 → `terraform init` → 旧 state（R2 に残存）で apply。
- Worker シークレットは state 移行では変わらない（IAM access key を再生成していないため）。ここが壊れない限り Worker 側の影響ゼロ。

### やってはいけないこと

- 旧 state に対して `terraform destroy` を打つ。IAM user / access key / Function URL が全部消える。
- `aws_iam_access_key.lambda_invoker` を **taint / replace / import** する（本移行の Phase 3 段階では）。**access key の secret 値は AWS 側でも生成時にしか取れない**ため、常に既存 state を経由する。※Phase 4.5 の rotation テストでは意図的に taint するが、それは Phase 3.5 まで完了して Worker secret 配布が terraform 化された後の話。
- Function URL リソースを削除 → 再作成。URL が変わって `nagisa-webui/wrangler.toml` のハードコード値が古くなる。

---

## 4. `LambdaInvoker` IAM ユーザー / Worker secret 配布

**方針: `aws_iam_access_key.lambda_invoker` の値を、同じ apply 内で `cloudflare_workers_secret` へ流し込む。**手動 `wrangler secret put` を廃止し、キー rotation を atomic に成立させる。本 IaC repo には既に Cloudflare provider が `services/cloudflare/account/` で稼働中のため、provider 追加コストはゼロ。

### 現状 vs 新方針

| 項目 | 現状 | 新方針 |
|---|---|---|
| IAM key の作成 | terraform | terraform（変更なし） |
| Worker secret への投入 | 人間が `wrangler secret put` を手動実行 | terraform apply が `cloudflare_workers_secret` で自動投入 |
| Rotation | ほぼ運用外 | `terraform taint aws_iam_access_key.lambda_invoker && terraform apply` の 1 コマンド |
| ドリフト可能性 | AWS 側と Worker 側で乖離しうる | ドリフト不能（同一 state で常に同期） |

### terraform リソーススケッチ

```hcl
# services/aws/lambda/variables.tf
variable "worker_scripts" {
  description = "AWS creds を投入する Worker script 名（nagisa-webui/wrangler.toml から手動反映）"
  type = object({
    staging    = string
    production = string
  })
}

variable "cloudflare_account_id" {
  description = "Cloudflare アカウント ID"
  type        = string
}

# services/aws/lambda/worker_secrets.tf
locals {
  worker_creds = {
    AWS_ACCESS_KEY_ID     = aws_iam_access_key.lambda_invoker.id
    AWS_SECRET_ACCESS_KEY = aws_iam_access_key.lambda_invoker.secret
  }
}

resource "cloudflare_workers_secret" "lambda_invoker" {
  for_each = {
    for combo in setproduct(keys(local.worker_creds), keys(var.worker_scripts)) :
    "${combo[0]}__${combo[1]}" => {
      name        = combo[0]
      script_name = var.worker_scripts[combo[1]]
      secret_text = local.worker_creds[combo[0]]
    }
  }

  account_id  = var.cloudflare_account_id
  script_name = each.value.script_name
  name        = each.value.name
  secret_text = each.value.secret_text
}
```

（`cloudflare_workers_secret` の attribute 名は使用中の Cloudflare provider version に合わせて実装前に確認する — v5 系は `secret_text`、旧版は `plaintext_value`。）

### 移行時のキー保護（最重要は不変）

1. **Phase 0**: 現在の Worker シークレット値を 1Password 等に退避。`wrangler secret list` では値が見えないので `.dev.vars` から。理由: 万一 access key を失うと `secret` 部分は AWS でも再取得不能。事前退避があれば最悪 rotation ルートに逃げられる。
2. **Phase 3**: state push で `aws_iam_access_key.lambda_invoker` の値（暗号化フィールド）がそのまま新 state に引き継がれる。plan で `will be replaced` が出たら **絶対に apply しない**。
3. **Phase 3.5**: `cloudflare_workers_secret` リソース追加 → plan で「create × 4、他 No changes.」を確認 → apply。Worker secret は同値上書きなので **無停止**。
4. **Phase 4.5**: staging で意図的に rotation テスト（`terraform taint aws_iam_access_key.lambda_invoker && terraform apply`）→ 新キーが staging Worker に即座に反映され Lambda 呼び出しが継続することを確認。

### 新方針のリスク

- **infra state に平文 AWS secret が乗る**。R2 backend の暗号化と access 制御に依存。`services/aws/lambda/README.md` に state 取扱い注意（backup を無防備に置かない、`state pull` 出力を chat や git に貼らない）を明記。
- **`worker_scripts` の指定ミス**で片環境のみ投入 → rotation 時に片方が古いキーで動き続ける事故に直結。`for_each` で必ず staging/production 両方が create されることを Phase 3.5 の plan で人間確認。
- **既存 secret の上書き**は同値なら無停止だが、Phase 0 退避値と infra state 内の値が完全一致することを Phase 3.5 apply 前に必ず突き合わせる（`terraform output -raw` vs 1Password 保管値）。

### 検証

- Phase 4: Worker staging に `bun run deploy` して同期 job を 1 本回す。SigV4 が通れば Phase 3.5 の上書きが正しかった証拠。
- Phase 4.5: taint→apply 後、staging で Lambda 呼び出しが継続していること。失敗したら Phase 0 退避値を wrangler CLI で手動戻して rollback。

---

## 5. env var / secret plumbing

| リポ | ファイル | 変数 | 用途 |
|---|---|---|---|
| nagisa-webui | `.env` | `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` | Worker deploy, wrangler |
| nagisa-webui | `.env` | （**`R2_STATE_*` を削除**） | terraform を持たなくなる |
| nagisa-webui | `.env` | （**`TF_VAR_r2_image_*` を削除**） | terraform を持たなくなる |
| nagisa-webui | `.dev.vars`（ローカル `wrangler dev` 専用） | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | ローカル dev。値は infra 側 `terraform output -raw` から取り出し手動貼り付け（初回セットアップ時） |
| nagisa-webui | wrangler secret (staging/production) | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | **手動 put は廃止**。infra 側 `cloudflare_workers_secret` が唯一の投入経路 |
| 本 IaC repo | `.env` or direnv | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | **R2 backend 用**（infra の慣習）。LambdaInvoker キーを絶対に入れない |
| 本 IaC repo | `.env` or direnv | `TF_VAR_nagisa_r2_image_access_key_id` / `..._secret_access_key` / `TF_VAR_nagisa_r2_account_id` | Lambda 環境変数として注入（nagisa-webui/.env から引越し） |
| 本 IaC repo | `.env` or direnv | `AWS_PROFILE` | AWS provider（IAM/Lambda 実操作） |

**慣習の食い違い**: 本 IaC repo は R2 backend キーを `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` で持つ（infra 全体の既存慣習）。この env 名で AWS provider が誤って動かないよう、provider ブロックは `profile = var.aws_profile` を明示指定するか、shell 内で apply 前に `unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY` する wrapper を挟む。

**nagisa-webui 側の `.env` 事故防止ルール**は本移行後も維持: `.env` に `AWS_*` 名で値を置かない（`scripts/cloudflare/set-secrets.sh` の暴発防止）。本移行で secret 経路が infra 一本化されたので、そもそも nagisa-webui 側に AWS 系値を持つ動機がなくなる。

---

## 6. nagisa-webui 側の `deploy:lambda` 廃止

submodule 方式では nagisa-webui 側から「Lambda をデプロイする」操作はなくなる。ハンドラを更新したら:

1. nagisa-webui で普通に PR → merge。
2. infra 側で `git submodule update --remote services/aws/lambda/vendor/nagisa-webui` → SHA を更新した commit を作成。
3. infra 側で `make apply`（build + terraform apply）。

`package.json` の変更:

- **削除**: `"deploy:lambda": "bun run lambda/fetch/build.ts && terraform -chdir=infra apply -auto-approve"`
- **追加（任意）**: `"build:lambda": "bun run lambda/fetch/build.ts"` — ローカルでビルド確認するとき用。infra 側の `make build` が呼ぶソースを nagisa-webui 単独でビルドしたいときに使う。

R2 バケット新設・publish スクリプト・追加認証は **すべて不要**。

---

## 7. ドキュメント更新

以下は本移行と同じ PR 群で更新する。

### nagisa-webui 側

| ファイル | 変更内容 |
|---|---|
| `CLAUDE.md` の「環境変数 / 認証情報」節 | `R2_STATE_*` / `TF_VAR_r2_image_*` を削除。「`AWS_*` を `.env` に置くな」ルールは残す。`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` の「消費者」列に「Worker（secret 値は infra 側 terraform で自動投入）」と明記。手動 `wrangler secret put` 廃止を注記 |
| `CLAUDE.md` の「Lambda デプロイ (terraform)」節 | 全面書き換え。「Lambda インフラは本 IaC repo (`qtmleap/infra`) が管理」「nagisa-webui にはハンドラソースのみ」「デプロイは infra 側で submodule 更新 → `make apply`」 |
| `scripts/lambda/README.md` | 「デプロイ方法」項に「terraform は infra リポへ移動、submodule 経由で参照」を明記。invoke.sh / local.ts / count.ts の使い方は変えない |
| `docs/features/lambda-fetch-migration-history.md` | 現「terraform: infra/*.tf」の記述に、移行後の位置（本 IaC repo）を追記。履歴ドキュメントなので旧記述は残す |
| `docs/features/lambda-processing-flow.md` | インフラ管理者の記述を追加（terraform は infra リポ） |
| `docs/PROJECT.md` | `infra/` ディレクトリ列があれば削除 |

### 本 IaC repo 側

| ファイル | 変更内容 |
|---|---|
| `services/aws/lambda/README.md`（新規または追記） | 「`anime-tracker-fetch[-us]` を管理」「ソースは submodule `vendor/nagisa-webui/`」「apply 手順は `make apply`（build + terraform apply）」「submodule 初期化: `git submodule update --init --recursive`」「Worker secret 4 本を同一 apply で同期」「rotation: `terraform taint aws_iam_access_key.lambda_invoker && terraform apply`」「state に平文 AWS secret が乗るため取扱い注意」「Bun runtime layer は infra 側で完結、共有 layer として他関数からも参照可」 |
| `services/aws/lambda/layers/bun-runtime/README.md`（新規） | 由来（初回移行時は「不明。既存 ZIP をバイナリコピー」と明記）・Bun バージョン（判明次第記録）・SHA256・再ビルド手順（build.sh 整備タスクへリンク）・「共有 layer」注記 |
| infra top-level README | submodule 追加後の初期化コマンド、apply 手順の入口 |
| `.gitmodules`（自動生成） | `branch = master` を明示 |

---

## 8. 実行順序（Step-by-Step）

**チェックポイントごとに人間 go/no-go 前提。**

### Phase 0: 準備 (destructive なし)

1. nagisa-webui で state バックアップ:
   `source .env && terraform -chdir=infra init && terraform -chdir=infra state pull > ~/backups/nagisa-webui.tfstate.$(date +%Y%m%d-%H%M%S).bak`
2. Worker の現在の wrangler secret `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` を 1Password 等に退避（`.dev.vars` から取る）。
3. **チェックポイント A**: バックアップ 2 つ（state + secret）が揃っていることを人間確認。

### Phase 1: submodule とアーティファクト経路の準備 (non-destructive)

4. 本 IaC repo で `git submodule add https://github.com/qtmleap/nagisa-webui.git services/aws/lambda/vendor/nagisa-webui`。`.gitmodules` の `branch = master` を明示。
5. `git submodule update --init --recursive` で初期化確認。
6. `services/aws/lambda/Makefile` を新設（build/plan/apply target）。
7. `make build` → `vendor/nagisa-webui/lambda/fetch/dist/function.zip` が生成されることを確認。SHA256 を控える。
8. layer ZIP を `nagisa-webui/lambda/layers/bun-runtime.zip` → `services/aws/lambda/layers/bun-runtime/bun-runtime.zip` にバイナリコピー。SHA256 を README に記録。
9. **チェックポイント B**: 両 ZIP のハッシュが nagisa-webui/infra 現行の apply が参照している値と一致することを人間確認（不一致なら bun build 非決定性 or コピーミス）。

### Phase 2: terraform 定義の配置 (non-destructive)

10. `services/aws/lambda/{main.tf, variables.tf, lambda.tf, layers.tf}` を配置（nagisa-webui/infra から移植 + backend key を `aws/lambda/terraform.tfstate` に変更 + providers を infra 流儀に統一 + `aws_profile` variable を通す）。
11. terraform の `filename` パスを書き換え:
    - `aws_lambda_function.fetch` / `.fetch_us`: `${path.module}/vendor/nagisa-webui/lambda/fetch/dist/function.zip`
    - `aws_lambda_layer_version.bun_runtime`: `${path.module}/layers/bun-runtime/bun-runtime.zip`
12. infra 側 `.env` / direnv を整備（§5 の表どおり）。
13. `terraform -chdir=services/aws/lambda init -reconfigure -backend-config=...` → **plan は打たない**（state 空なので Create の嵐で気持ち悪い）。
14. **チェックポイント C**: infra 側で `terraform init` が成功、`make build` が通る。ただしまだ state は空。

### Phase 3: state 移行 (destructive: state のみ、AWS リソース自体は不変)

15. `terraform -chdir=services/aws/lambda state push ~/backups/nagisa-webui.tfstate.<ts>.bak`
16. `make plan`（= `make build && terraform plan`）→ **`No changes.` を確認**。差分が出たら即中止、原因調査（アドレス名 → ZIP hash → provider version の順に疑う）。
17. **チェックポイント D**: `No changes.` を人間確認。
18. R2 上の旧 state キー `anime-tracker/terraform.tfstate` は **まだ削除しない**（rollback 保険）。

### Phase 3.5: Worker secret 配布の terraform 化 (destructive: 同値上書き = 無停止)

19. `services/aws/lambda/variables.tf` に `worker_scripts`（object） + `cloudflare_account_id` を追加。nagisa-webui の `wrangler.toml` の `[env.staging.name]` / `[env.production.name]` を人間確認して値を入れる。
20. `services/aws/lambda/worker_secrets.tf` を追加（§4 スケッチ）。
21. `terraform output -raw lambda_invoker_secret_access_key` の値と Phase 0 で 1Password に退避した値を **人間が突き合わせて完全一致を確認**。不一致なら Phase 3 の失敗を疑い即中止。
22. `terraform plan` → **「create × 4、他は No changes.」を確認**。
23. **チェックポイント D2**: plan 結果を人間確認。
24. `terraform apply` → Worker staging/production の secret が上書き（同値・無停止）。

### Phase 4: 動作検証 (non-destructive)

25. Worker staging に `bun run deploy` して Amazon の同期 job を 1 本回す。Lambda 呼び出し成功をログで確認（= secret 値が正しく引き継がれた証拠）。
26. Crunchyroll 同期を 1 本回して US Lambda（Bun runtime layer 消費）も動作確認。
27. **チェックポイント E**: 両リージョンの Lambda が呼べる。US 側 handler ログに Bun runtime が起動している痕跡。

### Phase 4.5: rotation テスト (staging 限定・意図的 destructive)

28. `terraform -chdir=services/aws/lambda taint aws_iam_access_key.lambda_invoker`
29. `terraform plan` で「IAM access key replace + `cloudflare_workers_secret` × 4 update」を確認。
30. `terraform apply` → 数十秒以内に staging Worker secret が新キーに切り替わる。
31. staging で同期 job を再実行 → Lambda 呼び出しが継続成功することを確認。**失敗した場合**: `terraform state rm cloudflare_workers_secret.lambda_invoker["AWS_*__staging"]` して Phase 0 退避値を wrangler CLI で手動戻し → 原因調査。
32. **チェックポイント E2**: rotation パイプラインが staging で通ることを実証。

### Phase 5: nagisa-webui 側の掃除 (destructive: ローカルファイル)

33. `nagisa-webui/infra/` を git rm。
34. `nagisa-webui/lambda/layers/bun-runtime.zip` を git rm。`lambda/layers/` ディレクトリごと削除。
35. `nagisa-webui/package.json` から `deploy:lambda` を削除、`build:lambda` を追加（任意）。
36. `.env` から `R2_STATE_*` と `TF_VAR_r2_image_*` を削除。
37. `scripts/cloudflare/set-secrets.sh` の README / コメントに「`AWS_*` は infra 側で管理、手動 put 禁止」を追記（スクリプト自体は他 secret 投入で使い続ける）。
38. `CLAUDE.md` および §7 のドキュメントを更新。
39. commit → PR → staging deploy → 動作再確認。
40. **チェックポイント F**: master merge して production deploy。

### Phase 6: 事後処理

41. 数日運用して問題ないことを確認 → R2 の旧 state キー `anime-tracker/terraform.tfstate` を削除。
42. 別タスク: infra 側で `layers/bun-runtime/build.sh` を整備し、Bun 更新のたびに再現可能な形で layer を再ビルドできるようにする（§1.5）。
43. 開発者オンボーディング更新: `.dev.vars` セットアップ手順に「infra 側 `terraform output -raw` から取得」を明記。

---

## 9. リスクと未解決事項

### 高リスク

- **`aws_iam_access_key.lambda_invoker` の意図せぬ replace（Phase 3 の state 移行時）**: plan で `will be replaced` が出た瞬間に事故る。**Phase 4.5 の rotation テストでの意図的な replace は正常動作**なので混同注意。
- **Function URL の URL 変更**: `aws_lambda_function_url` が destroy → create されると URL が変わり `nagisa-webui/wrangler.toml` のハードコードが古くなる。plan で `will be created`/`will be destroyed` を絶対に見逃さない。
- **`AWS_*` 名前空間の慣習衝突**: 本 IaC repo で R2 キーを `AWS_*` env に持つ vs nagisa-webui で `AWS_*` = LambdaInvoker 実キー。shell を跨いだ運用ミスで Worker secret が上書き or AWS provider が R2 キーで動こうとして失敗する。→ 別 shell / direnv 分離を運用ルール化。

### 中リスク

- **`make build` の source_code_hash 差分**: bun build は基本決定的だが確証がない。Phase 3 の Step 16 で hash 差が出たら apply 中止。同じ SHA でも devcontainer 版 bun とホスト bun で微差が出る可能性 → 「apply は必ず devcontainer 内で」を README で明文化。
- **infra 側 provider version 差**: nagisa-webui/infra 現行の AWS provider `~> 5.0` と本 IaC repo の既存 lock が違うと plan で差分が出る。Phase 2 で `.terraform.lock.hcl` を突き合わせる。
- **infra state に平文 AWS secret が乗る**: R2 backend の暗号化と access 制御に依存。backup 取扱いと state pull 出力の扱いを infra README に明記。
- **`cloudflare_workers_secret` の script 名指定ミス**: 片環境のみ投入されると rotation 時に片方が古いキーで動き続ける。`worker_scripts` を required + `for_each` で 4 リソース明示、Phase 3.5 の plan で人間確認。
- **`cloudflare_workers_secret` の attribute 名バージョン差**: `secret_text` vs `plaintext_value`。Phase 3.5 実装前に infra リポの Cloudflare provider version を確認。
- **submodule のロック管理**: 誰がいつ `git submodule update --remote` を打つか。無承認 update は Lambda コード変更に相当するため PR review 必須の運用ルール化。
- **submodule 内 build の再現性**: `vendor/nagisa-webui/` で `bun install` が走る。lock file の重要性、bun 版数の共通化（devcontainer で担保）を README で明記。

### 低リスク / 未解決

- **CI/CD 未整備**: nagisa-webui 側 GHA は Worker deploy のみ。infra 側の apply は手動継続前提。submodule 化により将来 CI で自動化する場合は「nagisa-webui master に merge → infra 側で自動 `git submodule update --remote` → PR → 自動 apply」の道筋が引ける（スコープ外）。
- **infra リポ側の PR / apply 承認フロー**: 誰がいつ apply するか、承認ルールがあるか。人間確認。
- **`bun-runtime.zip` のバイナリ由来不明**: 初回は既存 ZIP をコピーで持ち込むため移行リスクは無いが、監査観点では未解決。infra 側 `layers/bun-runtime/README.md` に「由来不明」と明記し、build.sh 整備で解消することを合意。
- **`docs/features/lambda-fetch-migration-history.md`** に「今回の移行」を追記するか、別ファイルを切るかは infra 側で判断。

### 人間に判断してもらうべき事項

1. submodule の配置パス（`vendor/nagisa-webui/` 案）でよいか。`modules/`, `external/` 等の別案があれば。
2. `bun-runtime.zip` の再ビルド手順を Phase 1 完了後どこまで詰めるか（infra 側で完全再現性を持たせるか、当面 ZIP 実体だけで運用するか）。
3. infra 側の apply 承認フロー（人間 apply か、CI 化するか）。
4. layer を将来他プロジェクトと共有する際、命名を `bun-runtime` のままにするか（推奨）。
5. staging と production を単一 `services/aws/lambda/` ディレクトリで両方管理するか、環境ごとに terraform workspace / 別ディレクトリに切るか。現状 Lambda 側は環境別化されていないため、単一ディレクトリ + `worker_scripts` object で両環境の secret を投入する構成を推奨。
6. Cloudflare provider の `cloudflare_workers_secret` attribute 名確認（Phase 3.5 実装前）。
7. submodule の追跡ブランチを `master` に固定するか、タグベースにするか。安定性重視ならタグベース。

---

## 10. Phase 2: container 化への移行（別 PR）

**本計画完了後の独立タスク。スケジュール未定。詳細は本ドキュメントの範疇外。**

現方式は ZIP + Bun runtime layer。将来 Lambda コンテナイメージ（ECR + `image_uri`）に切り替える動機:

- **Bun runtime layer の複雑さを ECR image 内に閉じ込められる** — `provided.al2023` + カスタムランタイム bootstrap の面倒を Docker で吸収。
- **`aws_lambda_layer_version.bun_runtime` 依存の解消** — 共有 layer を維持する運用コストが消える。
- **build.sh 整備問題の別解** — レイヤ再現性の議論そのものが不要になる（`Dockerfile` に集約）。

トレードオフ:

- **cold start への影響** — ZIP よりコンテナのほうが起動遅い可能性。実測が必要。
- **ECR / IAM の追加リソース** — レジストリ・push 権限・pull role 等の管理が新たに発生。
- **submodule 化との干渉** — Dockerfile 内で bun build するなら submodule 経由 build と統合可能。

Phase 2 移行時は本計画で整備した `services/aws/lambda/` を土台にする（`filename` → `image_uri` の切り替えが中心）。Worker secret 配布・IAM invoker・state レイアウトは温存できる。

---

## 付録: 現状ファイル参照

（nagisa-webui repo 内のパスは repo root 相対で示す）

- Worker Lambda クライアント: `src/lib/lambda.ts`
- Worker のキュー処理: `src/queue.ts`
- Worker bindings 定義: `wrangler.toml` (`LAMBDA_FUNCTION_URL`, `LAMBDA_FUNCTION_URL_US`)
- 現行 terraform root: `infra/{main.tf, lambda.tf, variables.tf}` — **本移行で撤去**
- Lambda ソース + ビルド: `lambda/fetch/{index.ts, build.ts}`
- Bun runtime layer（本移行で infra 側 `services/aws/lambda/layers/bun-runtime/` へ移動）: `lambda/layers/bun-runtime.zip`
- Worker secret 投入スクリプト: `scripts/cloudflare/set-secrets.sh` — 他 secret 投入で継続使用、`AWS_*` は対象外
- Lambda invoke utility: `scripts/lambda/{invoke.sh, local.ts, count.ts}`
- 既存ドキュメント: `docs/features/lambda-fetch-migration-history.md`, `docs/features/lambda-processing-flow.md`
- CI: `.github/workflows/deployment.yaml` — Worker deploy のみ、terraform 系ステップ無し
