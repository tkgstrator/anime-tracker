# ダウンロード進捗表示

## 概要

録画ボタン押下後、外部バックエンド（nagisa）で実行されるダウンロードの進捗をフロントエンドにリアルタイム表示する機能。

## 現状の課題

- 録画ボタンを押すと `POST /api/anime/:id/record` → nagisa に HTTP リクエストを送信し、即座に `{ success: true }` を返す
- ダウンロードが実際に進んでいるのか、完了したのか、失敗したのかをフロントエンドから知る手段がない
- ユーザーは「本当に動いてる？」という不安を抱える

## アーキテクチャ

```
フロントエンド ──3秒ポーリング──→ Workers(中継のみ) ──→ nagisa GET /api/status/:content_id
              ← { status, progress }  ←─────────────────┘
```

- Workers は nagisa の進捗 API をプロキシするだけ。D1 への保存は不要
- nagisa 側は BullMQ の `job.progress` を活用して進捗を返す
- フロントエンドは録画ボタン押下後にポーリングを開始し、完了/失敗で停止する

### 方式選定の理由

| 方式 | 評価 | 理由 |
|------|------|------|
| **ポーリング（採用）** | ベスト | Workers の制約なし、実装シンプル、3秒間隔で体感十分 |
| SSE | 不向き | Workers 内部で結局 nagisa をポーリングするので本質は同じ |
| WebSocket (Durable Objects) | オーバー | Durable Objects の追加課金・設定が必要、工数大 |

## 実装タスク

### 1. nagisa 側: 進捗 API 追加（0.5日）

BullMQ のジョブ進捗を返す Flask エンドポイントを追加する。

#### 1-1. ダウンロード処理で進捗を更新

ダウンロード処理のループ内で `job.update_progress()` を呼ぶ。

```python
# ダウンロード処理内（例）
for i, segment in enumerate(segments):
    download(segment)
    job.update_progress(int((i + 1) / len(segments) * 100))
```

#### 1-2. 進捗取得エンドポイント追加

```python
@app.route("/api/status/<content_id>")
def get_status(content_id):
    job = queue.get_job(content_id)
    if not job:
        return {"status": "not_found"}, 404
    return {
        "status": job.get_state(),     # "waiting" | "active" | "completed" | "failed"
        "progress": job.progress or 0, # 0-100
    }
```

### 2. Workers 側: 中継 API 追加（0.5日）

#### 2-1. エンドポイント追加

`src/routes/anime.ts` に進捗中継エンドポイントを追加する。

```typescript
// GET /api/anime/:id/download-status
app.get("/:id/download-status", async (c) => {
  const anime = await prisma.anime.findUnique({ where: { id } });
  const res = await fetch(
    `${env.BACKEND_URL}/api/status/${anime.contentId}`,
    { headers: { /* CF-Access headers */ } }
  );
  return c.json(await res.json());
});
```

#### 2-2. レスポンススキーマ定義

`src/schemas/anime.dto.ts` に進捗レスポンスの Zod スキーマを追加する。

```typescript
export const DownloadStatusResponse = z.object({
  status: z.enum(["waiting", "active", "completed", "failed", "not_found"]),
  progress: z.number().min(0).max(100),
});
```

### 3. フロントエンド: ポーリング + プログレス UI（1日）

#### 3-1. ポーリング Hook 作成

`src/app/hooks/use-download-progress.ts` を作成する。

```typescript
function useDownloadProgress(animeId: string, enabled: boolean) {
  // enabled が true の間、3秒間隔で GET /api/anime/:id/download-status をポーリング
  // status が "completed" | "failed" | "not_found" でポーリング停止
  // return { status, progress, isPolling }
}
```

#### 3-2. プログレスバー UI

アニメ詳細ページ（`src/app/routes/anime/$id/index.tsx`）の録画ボタン周辺に表示する。

- `waiting`: 「キュー待ち...」テキスト + パルスアニメーション
- `active`: プログレスバー（0-100%）+ パーセンテージ表示
- `completed`: 完了トースト通知 + ボタンを「録画済み」に切り替え
- `failed`: エラートースト通知 + リトライボタン表示

#### 3-3. 録画一覧への反映

`/recordings` ページにもダウンロード中のアニメにはミニプログレスインジケーターを表示する（任意）。

## 工数まとめ

| タスク | 対象 | 工数 |
|--------|------|------|
| 進捗更新 (`job.update_progress`) 追加 | nagisa | 0.5日 |
| `GET /api/status/:content_id` 追加 | nagisa | ↑に含む |
| 中継 API + Zod スキーマ追加 | Workers | 0.5日 |
| ポーリング Hook + プログレスバー UI | フロントエンド | 1日 |
| **合計** | | **約2日** |

## 将来の拡張

- 同時に複数ダウンロードが走る場合、一覧画面でまとめて進捗表示
- ポーリング間隔の動的調整（active 時は短く、waiting 時は長く）
- リアルタイム性が必要になった場合、Durable Objects + WebSocket に差し替え可能（ポーリング部分の置換のみ）
