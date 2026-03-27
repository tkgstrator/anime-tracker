# TanStack Query 移行計画

## 概要

フロントエンドのデータ取得を Zodios 直接呼び出しから **TanStack Query** に移行する。
Zodios は fetch レイヤーとして維持し、`queryFn` でラップする形をとる。

## 目的

| 現状の課題 | TanStack Query で解決 |
|-----------|---------------------|
| Nagisa ステータスがページ遷移時に 1 回取得されるだけで古くなる | `refetchInterval` による自動ポーリング |
| 一覧ページで `useState` × 7 + `useEffect` + `useCallback` の手動フェッチ | `useQuery` で宣言的に取得、フィルタ変更で自動リフェッチ |
| 詳細ページで `useState(loaderData)` にデータをコピー、ミューテーション後に手動で `setAnime` | `useSuspenseQuery` + `useMutation` + `invalidateQueries` |
| 録画ページで `usePaginatedFetch` カスタムフック | `useQuery` + `keepPreviousData` |
| ミューテーション後に他ページのキャッシュが古いまま | キャッシュ無効化で関連データを自動更新 |

## 方針

- **Zodios** (`src/app/lib/api.ts`) はそのまま維持。`queryFn` 内で呼ぶだけ
- **Jotai** の filter atoms (`atomWithStorage`) も維持。UI ステートとサーバーステートを分離
- TanStack Router の loader は **`ensureQueryData`** でプリフェッチに使う
- Nagisa ステータスは **`jotai-tanstack-query`** の `atomWithQuery` で Jotai と橋渡し

---

## Phase 0: インフラ整備

### 0.1 パッケージインストール

```bash
bun add @tanstack/react-query jotai-tanstack-query
bun add -D @tanstack/react-query-devtools
```

### 0.2 新規ファイル

| ファイル | 内容 |
|---------|------|
| `src/app/lib/query-client.ts` | `QueryClient` シングルトン。`staleTime: 2min`, `retry: 1` |
| `src/app/lib/query-keys.ts` | クエリキーファクトリ |
| `src/app/lib/query-options.ts` | 再利用可能な `queryOptions` 定義 |

**`query-keys.ts`**:

```ts
export const queryKeys = {
  anime: {
    all: ['anime'] as const,
    list: (filters: Record<string, unknown>) => ['anime', 'list', filters] as const,
    detail: (id: string) => ['anime', 'detail', id] as const,
  },
  home: {
    data: ['home'] as const,
  },
  nagisa: {
    status: ['nagisa', 'status'] as const,
  },
}
```

**`query-options.ts`** — Zodios を `queryFn` でラップ:

```ts
export const homeQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.home.data, queryFn: () => api.getHomeData() })

export const animeListQueryOptions = (filters: Record<string, unknown>) =>
  queryOptions({ queryKey: queryKeys.anime.list(filters), queryFn: () => api.getAnimeList({ queries: filters }) })

export const animeDetailQueryOptions = (id: string) =>
  queryOptions({ queryKey: queryKeys.anime.detail(id), queryFn: () => api.getAnime({ params: { id } }) })

export const nagisaStatusQueryOptions = () =>
  queryOptions({ queryKey: queryKeys.nagisa.status, queryFn: () => api.getNagisaStatus(), refetchInterval: 15_000 })
```

### 0.3 プロバイダ設定

**`src/app/main.tsx`**:

- `QueryClientProvider` でアプリをラップ
- `createRouter` の `context` に `queryClient` を渡す

**`src/app/routes/__root.tsx`**:

- `createRootRouteWithContext<{ queryClient: QueryClient }>()` に変更
- `ReactQueryDevtools` を開発時のみ追加

### 変更ファイル

| ファイル | 操作 |
|---------|------|
| `src/app/lib/query-client.ts` | 新規 |
| `src/app/lib/query-keys.ts` | 新規 |
| `src/app/lib/query-options.ts` | 新規 |
| `src/app/main.tsx` | 変更 |
| `src/app/routes/__root.tsx` | 変更 |

---

## Phase 1: Nagisa ステータス

他のルートに影響しない独立した変更。`jotai-tanstack-query` の動作確認も兼ねる。

### 変更内容

**`src/app/lib/atoms.ts`** — `nagisaStatusAtom` を `atomWithQuery` に書き換え:

```ts
import { atomWithQuery } from 'jotai-tanstack-query'
export const nagisaStatusAtom = atomWithQuery(() => nagisaStatusQueryOptions())
```

**`src/app/components/server-status-dialog.tsx`**:

- 戻り値が `NagisaStatusSchema | null` → `{ data, isPending, isError }` に変わる
- `isPending` でローディング、`isError` or `!data` でオフライン表示

**`src/app/routes/index.tsx`**:

- loader から `api.getNagisaStatus().then(...)` を削除

### 変更ファイル

| ファイル | 操作 |
|---------|------|
| `src/app/lib/atoms.ts` | 変更 |
| `src/app/components/server-status-dialog.tsx` | 変更 |
| `src/app/routes/index.tsx` | 変更 |

---

## Phase 2: ホームページ

### 変更内容

**loader**:

```ts
loader: ({ context: { queryClient } }) =>
  queryClient.ensureQueryData(homeQueryOptions()),
```

**コンポーネント**:

- `Route.useLoaderData()` はそのまま使用可能
- `byProvider` グルーピングロジックを `useMemo` へ移動

### 変更ファイル

| ファイル | 操作 |
|---------|------|
| `src/app/routes/index.tsx` | 変更 |

---

## Phase 3: アニメ詳細ページ

### 変更内容

**loader**:

```ts
loader: ({ params, context: { queryClient } }) =>
  queryClient.ensureQueryData(animeDetailQueryOptions(params.id)),
```

**コンポーネント**:

- `useState<AnimeInfoSchema>(loaderData)` → `useSuspenseQuery(animeDetailQueryOptions(id))` に置き換え
- `useState(false)` の `updating` → `mutation.isPending` に置き換え

**ミューテーション**:

```ts
const updateAnimeMutation = useMutation({
  mutationFn: (body) => api.updateAnime(body, { params: { id } }),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.anime.detail(id) })
    queryClient.invalidateQueries({ queryKey: queryKeys.anime.all })
    queryClient.invalidateQueries({ queryKey: queryKeys.home.data })
  },
})

const recordAnimeMutation = useMutation({
  mutationFn: () => api.recordAnime(undefined, { params: { id } }),
  onSuccess: () => toast.success('録画リクエストを送信しました'),
  onError: () => toast.error('録画リクエストに失敗しました'),
})
```

### 変更ファイル

| ファイル | 操作 |
|---------|------|
| `src/app/routes/anime/$id/index.tsx` | 変更 |

---

## Phase 4: 録画ページ

### 変更内容

**loader**:

```ts
loader: ({ context: { queryClient } }) =>
  queryClient.ensureQueryData(animeListQueryOptions({ scheduled: true, page: 1, limit: PAGE_SIZE })),
```

**コンポーネント** — `usePaginatedFetch` を置き換え:

```ts
const [page, setPage] = useState(1)
const { data } = useQuery({
  ...animeListQueryOptions({ scheduled: true, page, limit: PAGE_SIZE }),
  placeholderData: keepPreviousData,
})
```

### 変更ファイル

| ファイル | 操作 |
|---------|------|
| `src/app/routes/recordings/index.tsx` | 変更 |

---

## Phase 5: 一覧ページ

最も複雑な移行。Jotai atoms の値をクエリキーに含め、変更時に自動リフェッチさせる。

### 変更内容

**削除するもの**:

- `useState` × 4 (`animeList`, `totalPages`, `total`, `initialized`)
- `useCallback` (`fetchAnime`)
- `useEffect` (フェッチトリガー)
- `readStorage` ヘルパー関数

**置き換え**:

```ts
const [page] = useAtom(pageAtom)
const [filterProvider] = useAtom(filterProviderAtom)
// ... 他の filter atoms ...

const filters = { page, limit: PAGE_SIZE, provider: searchProvider ?? filterProvider, ... }
const { data } = useQuery({
  ...animeListQueryOptions(filters),
  placeholderData: keepPreviousData,
})
const animeList = data?.data ?? []
const totalPages = data?.totalPages ?? 0
const total = data?.total ?? 0
```

Jotai atom 変更 → `filters` 変更 → クエリキー変更 → 自動リフェッチ。

### 変更ファイル

| ファイル | 操作 |
|---------|------|
| `src/app/routes/browse/index.tsx` | 変更 |

---

## Phase 6: クリーンアップ

| 操作 | 対象 |
|------|------|
| 削除 | `src/app/hooks/use-paginated-fetch.ts` |
| 削除 | `src/app/lib/atoms.ts` の `store` エクスポート（不要になった場合） |
| 確認 | `src/app/lib/api.ts` は変更なし |

---

## キャッシュ無効化戦略

| ミューテーション | 無効化するキー |
|----------------|--------------|
| `PATCH /anime/:id` (scheduled/recorded) | `anime.detail(id)`, `anime.all` (prefix), `home.data` |
| `POST /anime/:id/record` | `anime.detail(id)`, `anime.all` (prefix) |
| `PUT /recordings` | `anime.all` (prefix) |
| `PUT /recordings/bulk` | `anime.all` (prefix) |

`anime.all` を prefix として `invalidateQueries` することで、一覧・録画ページのキャッシュも一括無効化される。

---

## 移行順序とリスク

| Phase | 対象 | リスク | 備考 |
|-------|------|--------|------|
| 0 | インフラ | 低 | 既存コードに影響なし |
| 1 | Nagisa ステータス | 低 | 独立したコンポーネント、動作検証に最適 |
| 2 | ホームページ | 低 | loader の単純な書き換え |
| 3 | 詳細ページ | 中 | ミューテーション + キャッシュ無効化 |
| 4 | 録画ページ | 低 | シンプルなページネーション |
| 5 | 一覧ページ | 中 | Jotai atoms + フィルタ連携が複雑 |
| 6 | クリーンアップ | 低 | 不要コード削除のみ |

各 Phase は独立してマージ可能。アプリはすべての中間状態で正常に動作する。
