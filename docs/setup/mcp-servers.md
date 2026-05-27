# MCP Server 導入ガイド

本プロジェクトでは以下の MCP (Model Context Protocol) Server を Claude Code で利用できるよう設定している。

## 設定ファイル

プロジェクトルートの `.mcp.json` にすべての MCP Server を定義している。
このファイルはリポジトリにコミットし、チーム全体で共有する。

## 導入済み MCP Server

### 1. Docker MCP Server

| 項目 | 値 |
|------|-----|
| パッケージ | `mcp-server-docker` |
| 用途 | Docker コンテナ・イメージの管理操作 |
| 前提条件 | Docker デーモンが起動していること |

**提供される機能:**

- コンテナの一覧・起動・停止・削除
- イメージの一覧・ビルド・プル
- Docker Compose 操作

### 2. GitHub MCP Server

| 項目 | 値 |
|------|-----|
| パッケージ | `@modelcontextprotocol/server-github` |
| 用途 | GitHub リポジトリ・Issue・PR の操作 |
| 前提条件 | GitHub Personal Access Token |

**セットアップ:**

`gh auth token` でトークンを自動取得するため、GitHub CLI でログイン済みであれば追加設定は不要。

```bash
# 未ログインの場合は以下を実行
gh auth login
```

`.mcp.json` では `sh -c` 経由で `gh auth token` を呼び出し、環境変数に自動設定している。

**提供される機能:**

- リポジトリの検索・作成・フォーク
- Issue / PR の作成・更新・コメント
- ファイルの読み取り・コミット・プッシュ
- ブランチ・タグの管理

### 3. Tailwind CSS MCP Server

| 項目 | 値 |
|------|-----|
| パッケージ | `tailwindcss-mcp-server` |
| 用途 | Tailwind CSS のクラス・ドキュメント参照 |
| 前提条件 | なし |
| 参考 | https://www.npmjs.com/package/tailwindcss-mcp-server |

**提供される機能:**

- Tailwind CSS ユーティリティクラスの検索・参照
- クラス名の提案・ドキュメント参照

### 4. shadcn/ui MCP Server

| 項目 | 値 |
|------|-----|
| パッケージ | `shadcn@latest` (CLI に内蔵) |
| 用途 | shadcn/ui コンポーネントのインストール・ドキュメント参照 |
| 前提条件 | なし |
| 参考 | https://ui.shadcn.com/docs/mcp |

**提供される機能:**

- shadcn/ui コンポーネントの一覧・検索
- コンポーネントのインストール支援
- コンポーネントのドキュメント・使用例の参照

### 5. Prisma MCP Server

| 項目 | 値 |
|------|-----|
| パッケージ | `prisma` (CLI に内蔵) |
| 用途 | Prisma スキーマの操作・マイグレーション支援 |
| 前提条件 | `prisma/schema.prisma` が存在すること |

**提供される機能:**

- Prisma スキーマの読み取り・解析
- モデル定義の確認
- マイグレーション関連の操作支援

### 6. Zod MCP Server

| 項目 | 値 |
|------|-----|
| 種別 | リモート (Streamable HTTP) |
| URL | `https://mcp.inkeep.com/zod/mcp` |
| 用途 | Zod ドキュメントの検索・参照 |
| 前提条件 | インターネット接続 |
| 参考 | https://zod.dev |

**提供される機能:**

- Zod v4 のドキュメント検索
- スキーマ定義のベストプラクティス参照
- API リファレンスの参照

> 他の MCP Server と異なり、リモートホスト型のため `url` で直接指定している。ローカルへのパッケージインストールは不要。

## 動作確認

MCP Server が正しく認識されているか確認するには、Claude Code 内で以下を実行する:

```
/mcp
```

各サーバーの状態と利用可能なツールが表示される。

## トラブルシューティング

### MCP Server が認識されない

1. `.mcp.json` がプロジェクトルートにあるか確認
2. Claude Code を再起動する
3. `bunx <パッケージ名>` が単体で実行できるか確認する

### GitHub MCP Server が接続できない

1. GitHub CLI にログイン済みか確認:
   ```bash
   gh auth status
   ```
2. トークンが取得できるか確認:
   ```bash
   gh auth token
   ```
3. 未ログインの場合は `gh auth login` を実行

### Docker MCP Server が動作しない

1. Docker デーモンが起動しているか確認:
   ```bash
   docker info
   ```
2. 現在のユーザーが `docker` グループに所属しているか確認
