import { expect, test } from '@playwright/test'

test.describe('一覧ページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/browse')
  })

  test('ページタイトルとアニメ件数が表示される', async ({ page }) => {
    await expect(page.locator('h1:has-text("アニメ一覧")')).toBeVisible()
    await expect(page.locator('text=/\\d+ 件のアニメを管理中/')).toBeVisible()
  })

  test('フィルターボタンが表示される', async ({ page }) => {
    await expect(page.locator('button:has-text("配信元")')).toBeVisible()
    await expect(page.locator('button:has-text("シーズン")')).toBeVisible()
    await expect(page.locator('button:has-text("ステータス")')).toBeVisible()
  })

  test('アニメカードがグリッド表示される', async ({ page }) => {
    const cards = page.locator('main a[href*="/anime/"]')
    await expect(cards.first()).toBeVisible()
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('アニメカードをクリックすると詳細ページに遷移する', async ({ page }) => {
    const firstCard = page.locator('main a[href*="/anime/"]').first()
    await firstCard.click()
    await expect(page.locator('button:has-text("戻る")')).toBeVisible()
  })

  test('検索バーでタイトル検索ができる', async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="タイトル検索"]')
    await searchInput.fill('hack')
    // 検索はデバウンスされるので待つ
    await page.waitForTimeout(500)
    const cards = page.locator('main a[href*="/anime/"]')
    await expect(cards.first()).toBeVisible()
  })
})
