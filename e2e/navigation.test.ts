import { expect, test } from '@playwright/test'

test.describe('ナビゲーション', () => {
  test('ヘッダーのリンクで各ページに遷移できる', async ({ page }) => {
    await page.goto('/')

    // ホームが表示される
    await expect(page.locator('a:has-text("Nagisa")')).toBeVisible()

    // 一覧に遷移
    await page.locator('nav a:has-text("一覧")').click()
    await expect(page.locator('h1:has-text("アニメ一覧")')).toBeVisible()

    // 録画に遷移
    await page.locator('nav a:has-text("録画")').click()
    await expect(page.locator('h1:has-text("録画予約一覧")')).toBeVisible()

    // ホームに戻る
    await page.locator('nav a:has-text("ホーム")').click()
    await expect(page).toHaveURL('/')
  })

  test('フッターからchangelogに遷移できる', async ({ page }) => {
    await page.goto('/')
    await page.locator('footer a[href="/changelog"]').click()
    await expect(page.locator('h1:has-text("Changelog")')).toBeVisible()
  })

  test('エラーページが表示される', async ({ page }) => {
    await page.goto('/404')
    await expect(page.getByText('404', { exact: true })).toBeVisible()
  })
})
