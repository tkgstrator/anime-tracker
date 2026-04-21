# ログ管理ライブラリ選定

## 背景

現在 `src/lib/logger.ts` で `console.log/warn/error` を JSON.stringify するカスタムラッパーを使用しているが、以下の課題がある:

- ログレベルによるフィルタリングができない（dev では debug を出したいが prod では info 以上のみにしたい等）
- リクエストIDやWorker名などのコンテキスト情報を自動付与する仕組みがない
- 階層的なカテゴリ分類（`sync.amazon`, `queue.process` など）ができない
- 外部サービスへの転送設定が組み込まれていない

## Cloudflare Workers の制約

Workers ランタイムは Node.js ではないため、以下の制約がある:

- `fs`, `stream`, `net`, `os` 等の Node.js API が使えない
- リクエストごとに短命な実行環境（長時間のバックグラウンドプロセス不可）
- `process.env` が存在しない（`env` は Bindings 経由で取得）

これにより **Winston は完全に非互換**、**Pino もブラウザビルドのみ** という制約がある。

## ライブラリ比較

### 推奨: LogTape

| 項目 | 詳細 |
|---|---|
| **CF Workers 互換性** | 公式サポート（エッジランタイムがファーストクラス） |
| **バンドルサイズ** | ~5.3 KB (min+gzip), 依存関係ゼロ |
| **構造化ログ** | JSON 出力、階層カテゴリ、テンプレートリテラル対応 |
| **ログレベル** | debug, info, warning, error, fatal |
| **外部連携** | OpenTelemetry sink, Sentry sink, AWS CloudWatch, Syslog |
| **Hono 連携** | `@logtape/hono` パッケージあり |
| **GitHub Stars** | ~1,700 |
| **メンテナンス** | 活発（2026年3月時点で v2.0.5） |

**メリット:**
- Cloudflare Workers を公式にサポートする唯一の主要ロガー
- Hono 専用ミドルウェアがあり、本プロジェクトと親和性が高い
- ベンチマークで Pino の約2倍、Winston の約10倍の速度
- Sink（出力先）を自由にカスタマイズ可能
- 階層カテゴリで `["app", "sync", "amazon"]` のようにモジュール単位で制御可能

**導入コスト:** 低〜中。設定ファイルでの初期化が必要だが、既存の `logger.*` 呼び出しは置き換えやすい。

---

### 次点: workers-tagged-logger

| 項目 | 詳細 |
|---|---|
| **CF Workers 互換性** | 専用設計（Workers 向けに作られた） |
| **バンドルサイズ** | 小（console.log のラッパー） |
| **構造化ログ** | JSON 構造化出力、タグとフィールド付与 |
| **ログレベル** | あり（動的レベル管理、優先度ベース） |
| **外部連携** | なし（console 出力 → Workers Logs / Logpush に依存） |
| **Hono 連携** | Hono ミドルウェア同梱 |
| **要件** | `nodejs_als` or `nodejs_compat` compatibility flag が必要 |

**メリット:**
- AsyncLocalStorage ベースのコンテキスト伝播（リクエストID等の自動付与）
- `setTags()` でリクエストスコープのタグを設定可能
- Workers に特化しているため余分な機能がない

**導入コスト:** 低。薄いラッパーなので理解しやすい。ただし `nodejs_compat` フラグの追加が必要。

---

### 軽量選択肢: consola (UnJS)

| 項目 | 詳細 |
|---|---|
| **CF Workers 互換性** | おそらく動作（公式テストなし） |
| **バンドルサイズ** | ~5-6 KB (コアビルド) |
| **構造化ログ** | カスタム JSON Reporter 経由で対応 |
| **ログレベル** | fatal(0), error(0), warn(1), log(2), info(3), debug(4), trace(5) |
| **外部連携** | カスタム Reporter で対応 |
| **Hono 連携** | なし |
| **GitHub Stars** | ~7,200 |

**メリット:**
- UnJS エコシステムの一部で広く使われている
- 開発時のターミナル出力が見やすい（Fancy Reporter）

**懸念点:**
- Workers での公式テストがない
- `process.env.CONSOLA_LEVEL` に依存する部分があり Workers で動かない可能性
- Hono 連携がないため自前でミドルウェアを書く必要がある

**導入コスト:** 中。動作検証が必要で、Workers 固有の問題が出る可能性がある。

---

### 非互換 / 非推奨

| ライブラリ | 理由 |
|---|---|
| **Winston** | Node.js API (fs, stream, net, os) に依存。Workers では動作しない |
| **Pino** | ブラウザビルドのみ動作。Transport（主要な価値）が Workers の短命実行と非互換 |
| **tslog** | `globalThis.navigator.userAgent` にアクセスして Workers でクラッシュ |
| **workers-logger (maraisr)** | 2025年4月にアーカイブ済み。メンテナンスされていない |
| **loglevel** | 動作はするがログレベルフィルタのみ。構造化ログなし。現状と大差ない |

## 補完ツール（ロガーとは別に検討）

### Cloudflare Workers Logs (ネイティブ)

`wrangler.toml` に以下を追加するだけで `console.log()` の出力がダッシュボードで検索可能になる:

```toml
[observability]
enabled = true
```

- 無料プラン: 3日間保持、200K ログ/日
- 有料プラン: 7日間保持、20M ログ/月
- JSON で出力すればフィールドが自動抽出・インデックスされる

### Workers Logpush

Workers Logs を外部サービス（Datadog, R2, S3 等）に転送。有料プランのみ。7日以上の保持が必要な場合に。

### Tail Workers

メインWorker のテレメトリを別 Worker で受信・加工。カスタムフィルタリングやサンプリングが可能。

### @sentry/cloudflare

エラー監視・パフォーマンス監視。ロガーとは別レイヤーの監視として併用推奨。Hono 連携あり。

## 推奨構成

```
LogTape（構造化ログ + レベル制御 + カテゴリ）
  ├── Console Sink → Workers Logs（ダッシュボード検索）
  ├── (将来) OpenTelemetry Sink → 外部監視
  └── (将来) Logpush → 長期保存（R2/S3）

+ @sentry/cloudflare（エラー監視、補完的に導入）
```

## 導入手順の概要（LogTape の場合）

```bash
bun add @logtape/logtape @logtape/hono
```

1. `src/lib/logger.ts` を LogTape ベースに書き換え
2. Hono アプリに `@logtape/hono` ミドルウェアを追加
3. 各モジュールで `getLogger(["app", "module名"])` でロガーを取得
4. `wrangler.toml` に `[observability] enabled = true` を追加
5. 既存の `logger.info(...)` 呼び出しを LogTape API に移行
