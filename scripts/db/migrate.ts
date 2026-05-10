/**
 * Prisma 形式の migration を Cloudflare D1 に当てる。
 *
 * wrangler d1 migrations apply は Prisma の `<timestamp>_<name>/migration.sql`
 * というディレクトリ形式を認識しないため、自前で d1_migrations テーブルを
 * 見ながら未適用分だけ wrangler d1 execute --file で流す。
 *
 * Usage:
 *   bun scripts/db/migrate.ts <target>        # 未適用 migration を流す
 *   bun scripts/db/migrate.ts <target> init   # 全 migration を「適用済み」として記録 (SQL は流さない)
 *
 *   target: local | staging | production
 *
 * staging / production を当てる際は事前に source .env で
 * CLOUDFLARE_API_TOKEN を読み込んでおく。
 *
 * init モード: 既存 DB に reset.sh などで migration を直接流したあと、
 * d1_migrations を「全部適用済み」状態に整える。新規 DB 構築直後は不要。
 */
import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

type Target = 'local' | 'staging' | 'production'

const target = process.argv[2] as Target
const mode = process.argv[3] as 'init' | undefined
if (!['local', 'staging', 'production'].includes(target) || (mode && mode !== 'init')) {
  console.error('Usage: bun scripts/db/migrate.ts <local|staging|production> [init]')
  process.exit(1)
}

const dbName = target === 'production' ? 'anime-tracker-production' : 'anime-tracker-staging'
const wranglerEnv = target === 'local' ? ['--local'] : ['--remote', `--env=${target}`]

async function exec(args: string[]): Promise<string> {
  const proc = Bun.spawn(['bunx', 'wrangler', 'd1', 'execute', dbName, ...wranglerEnv, ...args], {
    stdout: 'pipe',
    stderr: 'inherit'
  })
  const out = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) throw new Error(`wrangler d1 execute failed (exit ${code})`)
  return out
}

async function command(sql: string): Promise<unknown> {
  const out = await exec(['--json', '--command', sql])
  const start = out.indexOf('[')
  const json = JSON.parse(out.slice(start))
  return json[0]?.results ?? []
}

async function ensureMigrationsTable(): Promise<void> {
  await command(
    'CREATE TABLE IF NOT EXISTS d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at DATETIME DEFAULT CURRENT_TIMESTAMP)'
  )
}

async function getApplied(): Promise<Set<string>> {
  const rows = (await command('SELECT name FROM d1_migrations ORDER BY id')) as { name: string }[]
  return new Set(rows.map((r) => r.name))
}

const migrationsDir = resolve(import.meta.dir, '../../prisma/migrations')
const dirs = readdirSync(migrationsDir)
  .filter((d) => /^\d{14}_/.test(d))
  .sort()

await ensureMigrationsTable()
const applied = await getApplied()
const pending = dirs.filter((d) => !applied.has(d))

console.log(`Target: ${target} (${dbName})`)
console.log(`Applied: ${applied.size}, Pending: ${pending.length}`)

if (pending.length === 0) {
  console.log('Nothing to do.')
  process.exit(0)
}

if (mode === 'init') {
  for (const d of pending) {
    await command(`INSERT INTO d1_migrations (name) VALUES ('${d}')`)
    console.log(`✓ marked ${d}`)
  }
  console.log(`Init done. Marked ${pending.length} migration(s) as applied without running SQL.`)
  process.exit(0)
}

for (const d of pending) {
  const file = resolve(migrationsDir, d, 'migration.sql')
  console.log(`→ Applying ${d}`)
  await exec(['--file', file])
  await command(`INSERT INTO d1_migrations (name) VALUES ('${d}')`)
  console.log(`✓ ${d}`)
}

console.log(`Done. Applied ${pending.length} migration(s).`)
