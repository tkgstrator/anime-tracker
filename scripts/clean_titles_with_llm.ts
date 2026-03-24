/**
 * Cloudflare Workers AIを使ってアニメタイトルからオリジナル（第1期）のタイトルを推定する
 *
 * 例:
 *   「みつどもえ 増量中!」→「みつどもえ」
 *   「やはり俺の青春ラブコメはまちがっている。続」→「やはり俺の青春ラブコメはまちがっている。」
 *   「DARKER THAN BLACK -流星の双子-」→「DARKER THAN BLACK」
 *   「俗・さよなら絶望先生」→「さよなら絶望先生」
 *
 * Usage: CF_ACCOUNT_ID=... CF_API_TOKEN=... bun run scripts/clean_titles_with_llm.ts
 */

const CF_ACCOUNT_ID = process.env.CLOUDFLARE_ACCOUNT_ID!
const CF_API_TOKEN = process.env.CLOUDFLARE_API_TOKEN!
if (!CF_ACCOUNT_ID || !CF_API_TOKEN) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required')
  process.exit(1)
}

const MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast'
const CF_API_BASE = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/ai/run/${MODEL}`

const CACHE_DIR = '.cache'
const BATCH_SIZE = 50

interface NotFoundEntry {
  contentId: string
  title: string
  cleanedTitle: string
  entityType?: string
}

interface CfAiResponse {
  result: { response: string }
  success: boolean
  errors: unknown[]
}

async function callCfAi(prompt: string): Promise<string> {
  const res = await fetch(CF_API_BASE, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messages: [
        { role: 'user', content: prompt },
      ],
    }),
  })
  if (!res.ok) {
    throw new Error(`CF AI API error: ${res.status} ${await res.text()}`)
  }
  const data = (await res.json()) as CfAiResponse
  if (!data.success) {
    throw new Error(`CF AI error: ${JSON.stringify(data.errors)}`)
  }
  return data.result.response
}

async function extractOriginalTitles(titles: string[]): Promise<Record<string, string>> {
  const numbered = titles.map((t, i) => `${i + 1}. ${t}`).join('\n')

  const prompt = `以下はアニメのタイトル一覧です。各タイトルについて、シリーズの第1期（オリジナル）のタイトルを推定してください。

ルール:
- 2期以降を示す表現（「続」「第2期」「Season 2」「II」「2nd」など）を除去して、第1期のタイトルを返す
- シリーズ固有の2期表現も判断する（例: 「増量中!」「リベンジ」「NEW」「Next」など）
- サブタイトル（「～xxx～」「-xxx-」）がシリーズ名の一部でなければ除去する
- 第1期のタイトルそのものの場合は、そのまま返す
- アニメではないもの（実写、舞台、特典映像、ミュージカル、朗読劇など）は "SKIP" と返す

各行に「番号. 推定したオリジナルタイトル」の形式で返してください。説明は不要です。

${numbered}`

  const text = await callCfAi(prompt)

  const result: Record<string, string> = {}
  for (const line of text.split('\n')) {
    const match = line.match(/^(\d+)\.\s*(.+)$/)
    if (match) {
      const idx = parseInt(match[1]) - 1
      const original = match[2].trim()
      if (idx >= 0 && idx < titles.length && original !== 'SKIP') {
        result[titles[idx]] = original
      }
    }
  }
  return result
}

function progress(msg: string) {
  process.stdout.write(`\r\x1b[K${msg}`)
}

async function main() {
  const provider = 'amazon'
  const notFoundPath = `${CACHE_DIR}/${provider}/not_found.json`
  const entries: NotFoundEntry[] = await Bun.file(notFoundPath).json()

  console.log(`Loaded ${entries.length} not_found entries from ${notFoundPath}`)

  // cleanedTitleでユニークなタイトルを抽出
  const uniqueTitles = [...new Set(entries.map((e) => e.cleanedTitle))]
  console.log(`Unique cleaned titles: ${uniqueTitles.length}`)
  console.log(`Batches: ${Math.ceil(uniqueTitles.length / BATCH_SIZE)} (${BATCH_SIZE}/batch)`)
  console.log(`Model: ${MODEL}\n`)

  const allMappings: Record<string, string> = {}
  let processed = 0
  let skipped = 0

  for (let i = 0; i < uniqueTitles.length; i += BATCH_SIZE) {
    const batch = uniqueTitles.slice(i, i + BATCH_SIZE)
    try {
      const mappings = await extractOriginalTitles(batch)
      const changed = Object.entries(mappings).filter(([k, v]) => k !== v).length
      skipped += batch.length - Object.keys(mappings).length
      Object.assign(allMappings, mappings)
      processed += batch.length

      progress(`[${processed}/${uniqueTitles.length}] +${changed} modified, ${skipped} skipped`)
    } catch (e) {
      console.error(`\nBatch ${i} failed:`, e instanceof Error ? e.message : e)
      processed += batch.length
    }
  }
  console.log('')

  // 結果を保存
  const outputPath = `${CACHE_DIR}/${provider}/llm_cleaned.json`
  await Bun.write(outputPath, JSON.stringify(allMappings, null, 2) + '\n')

  const totalChanged = Object.entries(allMappings).filter(([k, v]) => k !== v).length
  console.log(`\nDone: ${Object.keys(allMappings).length} mappings, ${totalChanged} modified, ${skipped} skipped`)
  console.log(`Output: ${outputPath}`)

  // サンプル表示
  console.log('\nModified samples:')
  const modified = Object.entries(allMappings)
    .filter(([k, v]) => k !== v)
    .slice(0, 30)
  for (const [original, cleaned] of modified) {
    console.log(`  "${original}" → "${cleaned}"`)
  }
}

main()
