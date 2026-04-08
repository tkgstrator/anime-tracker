# Lambda Invoke Scripts

## Usage

```bash
scripts/lambda/invoke.sh <endpoint> <provider> [category]
```

- `endpoint`: `title_list` | `expiring`
- `provider`: `amazon` | `hulu` | `crunchyroll`
- `category`: `new_episode` | `coming_soon` (`title_list` のみ必須)

## Lambda 関数 / リージョン

| Provider     | Function Name            | Region           |
| ------------ | ------------------------ | ---------------- |
| amazon       | anime-tracker-fetch      | ap-northeast-1   |
| hulu         | anime-tracker-fetch      | ap-northeast-1   |
| crunchyroll  | anime-tracker-fetch-us   | us-east-1        |

## 取得先 URL 一覧

### Amazon Prime Video

| Category    | URL                                                                                                                                                                                          |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| new_episode | [新着アニメ](https://www.amazon.co.jp/gp/video/storefront?filterId=OFFER_FILTER%3DSUBSCRIPTIONS&node=2351649051&sort=DATE_ADDED_DESC&ie=UTF8&contentType=tv&contentId=animech)                |
| coming_soon | (未対応)                                                                                                                                                                                     |
| expiring    | [配信終了間近](https://www.amazon.co.jp/gp/video/storefront?contentType=tv&contentId=animech&filterId=OFFER_FILTER%3DSUBSCRIPTIONS&node=4217520051)                                           |

### Hulu Japan

| Category    | URL                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------ |
| new_episode | [新着アニメ](https://www.hulu.jp/tiles/recentlyadded-anime)                                |
| coming_soon | [今期アニメ](https://www.hulu.jp/tiles/april-june-quarter-anime26) (季節で変動)             |
| expiring    | [アニメ一覧](https://www.hulu.jp/tiles/all-anime) (API でソート)                            |

- `new_episode`: `recentlyadded-anime` + 季節スラッグを併用
- `coming_soon`: 季節スラッグから `coming_soon_text` を持つエントリを抽出
- `expiring`: Filtered API で `publish_end_at` 昇順ソート、30 日以内を返却

### Crunchyroll

| Category    | URL                                                                                        |
| ----------- | ------------------------------------------------------------------------------------------ |
| new_episode | [新着順](https://www.crunchyroll.com/ja/videos/new)                                        |
| coming_soon | (未対応)                                                                                   |
| expiring    | (未対応)                                                                                   |

- `new_episode`: Browse API で `sort_by=newly_added`、`new: true` フラグでフィルタ
