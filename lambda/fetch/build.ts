/**
 * anime-tracker-fetch Lambda を Docker image としてビルドし、東京 + US 両方の ECR に push する。
 *
 * 使い方: `bun run deploy:lambda` (package.json 参照)
 * 前提:
 *   - docker (buildx 有効化済) が利用可能
 *   - aws CLI がインストール済み、default profile で ECR: PutImage 権限あり
 *   - 事前に qtmleap/infra 側で両リージョンの ECR リポジトリ (anime-tracker-fetch) を apply 済み
 *
 * Lambda container image は関数と同一リージョンの ECR にしか置けない (AWS の hard limit) ため、
 * 東京 (ap-northeast-1) と US (us-east-1) の両方に同一 image を push する。
 *
 * このスクリプトは Lambda 関数本体の tag 差し替えまではやらない。
 * push 後に qtmleap/infra 側で `TF_VAR_anime_tracker_image_tag=<sha> terraform apply` を叩くこと。
 */
import { resolve } from 'node:path'

const REGIONS = ['ap-northeast-1', 'us-east-1'] as const
const REPOSITORY = 'anime-tracker-fetch'
const PLATFORM = 'linux/arm64'
const DOCKERFILE = 'lambda/fetch/Dockerfile'

const repoRoot = resolve(import.meta.dir, '..', '..')

async function run(cmd: string[], opts: { cwd?: string; env?: Record<string, string>; stdin?: ReadableStream | string } = {}): Promise<{ stdout: string }> {
  const proc = Bun.spawn(cmd, {
    cwd: opts.cwd ?? repoRoot,
    env: { ...process.env, ...opts.env },
    stdout: 'pipe',
    stderr: 'inherit',
    stdin: opts.stdin ?? 'inherit'
  })
  const stdout = await new Response(proc.stdout).text()
  const code = await proc.exited
  if (code !== 0) throw new Error(`${cmd[0]} exited with code ${code}: ${cmd.join(' ')}`)
  return { stdout }
}

async function getAccountId(): Promise<string> {
  const { stdout } = await run(['aws', 'sts', 'get-caller-identity', '--query', 'Account', '--output', 'text'])
  return stdout.trim()
}

async function getGitSha(): Promise<string> {
  const { stdout } = await run(['git', 'rev-parse', '--short', 'HEAD'])
  return stdout.trim()
}

async function ensureBuildx(): Promise<void> {
  const proc = Bun.spawn(['docker', 'buildx', 'inspect', 'anime-tracker-builder'], {
    stdout: 'ignore',
    stderr: 'ignore'
  })
  if ((await proc.exited) !== 0) {
    console.log('Creating docker buildx builder "anime-tracker-builder"...')
    await run(['docker', 'buildx', 'create', '--name', 'anime-tracker-builder', '--use'])
  } else {
    await run(['docker', 'buildx', 'use', 'anime-tracker-builder'])
  }
}

async function ecrLogin(region: string, registry: string): Promise<void> {
  console.log(`Logging in to ECR ${registry}...`)
  const pw = Bun.spawn(['aws', 'ecr', 'get-login-password', '--region', region], {
    stdout: 'pipe',
    stderr: 'inherit'
  })
  const password = await new Response(pw.stdout).text()
  if ((await pw.exited) !== 0) throw new Error(`aws ecr get-login-password failed (region=${region})`)

  const login = Bun.spawn(['docker', 'login', '--username', 'AWS', '--password-stdin', registry], {
    stdin: 'pipe',
    stdout: 'inherit',
    stderr: 'inherit'
  })
  login.stdin.write(password)
  await login.stdin.end()
  if ((await login.exited) !== 0) throw new Error(`docker login failed (registry=${registry})`)
}

/**
 * 全リージョンの tag を並べて 1 回の buildx build で push する。
 * buildx は arm64 image を一度ビルドしてから複数タグに push できるので、
 * リージョンごとに build し直す必要はない。
 */
async function buildAndPush(tags: string[]): Promise<void> {
  console.log(`Building & pushing image with tags:`)
  for (const t of tags) console.log(`  ${t}`)

  const tagArgs = tags.flatMap((t) => ['--tag', t])
  await run([
    'docker', 'buildx', 'build',
    '--platform', PLATFORM,
    '--file', DOCKERFILE,
    ...tagArgs,
    '--push',
    '.'
  ])
}

async function main(): Promise<void> {
  const [accountId, sha] = await Promise.all([getAccountId(), getGitSha()])

  const registries = REGIONS.map((region) => ({
    region,
    registry: `${accountId}.dkr.ecr.${region}.amazonaws.com`
  }))

  await ensureBuildx()
  for (const { region, registry } of registries) {
    await ecrLogin(region, registry)
  }

  const tags = registries.flatMap(({ registry }) => [
    `${registry}/${REPOSITORY}:${sha}`,
    `${registry}/${REPOSITORY}:latest`
  ])

  await buildAndPush(tags)

  console.log('')
  console.log('✔ push complete.')
  console.log('')
  console.log('Next: update Lambda image_uri via terraform in qtmleap/infra:')
  console.log('')
  console.log('  cd ~/infra/services/aws/lambda')
  console.log(`  export TF_VAR_anime_tracker_image_tag=${sha}`)
  console.log('  terraform apply')
  console.log('')
}

await main()
