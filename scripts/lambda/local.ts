/**
 * Lambda handler を AWS を介さずローカル実行する。
 *
 * Usage:
 *   bun scripts/lambda/local.ts <path> <json-body>
 *
 *   bun scripts/lambda/local.ts /expiring '{"provider":"amazon"}'
 *   bun scripts/lambda/local.ts /title_list '{"provider":"hulu","category":"new_episode"}'
 *   bun scripts/lambda/local.ts /title_info '{"provider":"abema","contentId":"..."}'
 *   bun scripts/lambda/local.ts /identify '{"titles":["呪術廻戦"]}'
 *
 * Crunchyroll は VPN 必須なのでローカル実行不可。
 */
import dayjs from 'dayjs'
import { handler } from '../../lambda/fetch/index'

const [, , rawPath, rawBody] = process.argv
if (!rawPath || !rawBody) {
  console.error('Usage: bun scripts/lambda/local.ts <path> <json-body>')
  process.exit(1)
}

const event = { rawPath, body: rawBody }
const start = dayjs()
const res = await handler(event)
const ms = dayjs().diff(start, 'millisecond')

console.log(`status=${res.statusCode}  ${ms}ms`)
console.log('===RESULT===')
console.log(res.body)
