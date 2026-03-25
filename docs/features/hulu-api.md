# Hulu Japan API ドキュメント

## 概要

Hulu Japan のTVアニメシリーズ一覧は、内部 API `/api/v2/filtered` で取得できる。
認証不要で、ページネーションとソートに対応している。

---

## エンドポイント

```
GET https://www.hulu.jp/api/v2/filtered
```

### 固定パラメータ（TVアニメ一覧）

| パラメータ | 値 | 説明 |
|-----------|-----|------|
| `id` | `mt:tv` | メディアタイプ: TV |
| `id` | `gft:and` | ジャンルフィルタモード: AND |
| `id` | `g:8` | ジャンル: アニメ |
| `id` | `edg:tv_animation` | エディトリアルカテゴリ: TVアニメ |
| `service` | `hulu` | サービス指定 |

### ページネーション

| パラメータ | 説明 |
|-----------|------|
| `from` | 開始インデックス（0始まり） |
| `to` | 終了インデックス（`from + 49` で50件ずつ） |

### ソート

`sort` パラメータに JSON 配列を指定する。

| ページURL `?so=` | API `sort` 値 | 説明 |
|------------------|---------------|------|
| `yr` | `[{"values.premiere_year":"desc"}]` | 新着順（初回放送年の降順） |
| `ps` | `[{"publish_start_at":"desc"}]` | 配信開始日の降順 |
| `lapsd` | `[{"values.latest_asset_publish_start_at":"desc"}]` | 最新エピソード配信日の降順 |
| （デフォルト） | `[{"values.weekly_uu":"desc"}]` | 人気順（週間UUの降順） |

---

## リクエスト例

```
GET https://www.hulu.jp/api/v2/filtered?id=mt:tv&id=gft:and&id=g:8&id=edg:tv_animation&sort=[{"values.premiere_year":"desc"}]&service=hulu&from=0&to=49
```

---

## レスポンス

```jsonc
{
  "total_count": 1933,  // 総件数（2026-03-25 時点）
  "data": [
    {
      "id": 1117799,
      "id_in_schema": 500021925,
      "title": "最推しの義兄を愛でるため、長生きします!",
      "description": "シリーズ累計17万部を突破した人気作が送る...",
      "slug": "ill-live-a-long-life-to-dote-on-my-favorite-stepbrother",
      "imageUrl": "https://images.prod.hjholdings.tv/.../image.png?w=331&h=447&p=t",
      "rental": false,
      "startAt": "2025/12/12 00:00:00",
      "endAt": "2027/03/31 23:59:59",
      "isLogin": false,
      "schema_key": "series",
      "model_id": "series:500021925",
      "categoryMetas": ["アニメ", "ファンタジー", "恋愛"],
      "price": "",
      "features": ["2026年 冬アニメ", "異世界転生アニメ"],
      "additionalInfo": { ... }
    }
    // ... 最大50件
  ]
}
```

### 主なフィールド

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `total_count` | number | フィルタ条件に合致する総件数 |
| `data[].id` | number | Hulu内部ID |
| `data[].title` | string | 作品タイトル |
| `data[].slug` | string | URLスラッグ（`https://www.hulu.jp/{slug}` でアクセス可能） |
| `data[].imageUrl` | string | サムネイル画像URL |
| `data[].startAt` | string | 配信開始日時 |
| `data[].endAt` | string | 配信終了日時 |
| `data[].rental` | boolean | レンタル作品か |
| `data[].categoryMetas` | string[] | カテゴリタグ |
| `data[].features` | string[] | 特集タグ（「2026年 冬アニメ」など） |
| `data[].schema_key` | string | スキーマ種別（`"series"`） |
| `data[].model_id` | string | モデルID（`"series:500021925"`） |

---

## 備考

- 認証不要（未ログインでもアクセス可能）
- 50件ずつのページネーション（`from`/`to` で制御）
- `total_count` は全ソートで共通（2026-03-25 時点: 1,933件）
- ブラウザページ URL: `https://www.hulu.jp/browse/editorial/13812`
- 初回50件は Next.js SSR で配信され、スクロール時に XHR で追加ロードされる
