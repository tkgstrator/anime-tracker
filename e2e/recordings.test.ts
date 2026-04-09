import { expect, test } from '@playwright/test'

test.describe('録画ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/recordings')
  })

  test('ページタイトルが表示される', async ({ page }) => {
    await expect(page.locator('h1:has-text("録画予約一覧")')).toBeVisible()
  })

  test('録画一覧またはempty stateが表示される', async ({ page }) => {
    // データの有無に応じてどちらかが表示される
    const items = page.locator('main a[href*="/anime/"]')
    const emptyMsg = page.locator('text=録画予約されたタイトルはありません')
    await expect(items.first().or(emptyMsg)).toBeVisible()
  })
})
