import { defineConfig } from 'playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  use: {
    headless: true
  },
  projects: [
    {
      name: 'local',
      use: {
        browserName: 'chromium',
        baseURL: 'http://localhost:25173'
      }
    },
    {
      name: 'staging',
      use: {
        browserName: 'chromium',
        baseURL: process.env.STAGING_URL
      }
    }
  ],
  ...(process.env.PLAYWRIGHT_SKIP_WEBSERVER
    ? {}
    : {
        webServer: {
          command: 'bun run dev',
          url: 'http://localhost:25173',
          reuseExistingServer: true,
          timeout: 60_000
        }
      })
})
