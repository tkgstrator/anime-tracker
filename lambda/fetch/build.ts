/**
 * Lambda 関数を bun build でバンドルし、zip に圧縮する。
 */
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

const dir = resolve(import.meta.dir)
const distDir = resolve(dir, 'dist')

mkdirSync(distDir, { recursive: true })

await Bun.build({
  entrypoints: [resolve(dir, 'index.ts')],
  outdir: distDir,
  target: 'node',
  format: 'esm',
  minify: true,
  sourcemap: 'none',
  naming: '[dir]/[name].mjs'
})

console.log('Bundle created: dist/index.mjs')

const zip = Bun.spawn(['zip', '-j', 'function.zip', 'index.mjs'], {
  cwd: distDir,
  stdout: 'inherit',
  stderr: 'inherit'
})
const code = await zip.exited
if (code !== 0) throw new Error(`zip exited with code ${code}`)

console.log('Archive created: dist/function.zip')
