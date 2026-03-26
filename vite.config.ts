import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const version = JSON.parse(readFileSync('./package.json', 'utf-8')).version
const hash = execSync('git rev-parse --short HEAD').toString().trim()
const gitLog = execSync('git log --format="%h %aI %s" -50').toString().trim().split('\n').map((line) => {
  const [hash, date, ...rest] = line.split(' ')
  return { hash, date: date.slice(0, 10), message: rest.join(' ') }
})

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  process.env.NODE_ENV = mode === 'development' ? 'development' : 'production'
  return {
    server: {
      port: 25173,
      proxy: {}
    },
    plugins: [
      {
        name: 'build-info',
        buildStart() {
          console.log(`Environment: ${process.env.NODE_ENV}`)
          console.log(`Building app version: ${version} (git hash: ${hash}) in ${mode} mode`)
        },
        configureServer(server) {
          server.middlewares.use('/commits.json', (_req, res) => {
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(gitLog))
          })
        },
        writeBundle() {
          writeFileSync(resolve(__dirname, 'dist/client/commits.json'), JSON.stringify(gitLog))
        }
      },
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
        routesDirectory: resolve(__dirname, './src/app/routes'),
        generatedRouteTree: resolve(__dirname, './src/app/routeTree.gen.ts')
      }),
      react(),
      tailwindcss(),
      cloudflare({
        configPath: './wrangler.toml'
      }),
    ],
    build: {
      target: 'esnext',
      minify: true
    },
    worker: {
      format: 'es'
    },
    ssr: {
      target: 'webworker'
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src')
      }
    },
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __GIT_HASH__: JSON.stringify(hash),
      __GIT_DATE__: JSON.stringify(execSync('git log -1 --format=%aI').toString().trim())
    }
  }
})
