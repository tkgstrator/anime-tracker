import { expect, test } from '@playwright/test'

test.describe('ホームページ', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
  })

  test('カルーセルセクションが表示される', async ({ page }) => {
    await expect(page.locator('h2:has-text("新着エピソード")')).toBeVisible()
    await expect(page.locator('h2:has-text("最近追加されたアニメ")')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'もうすぐ配信', exact: true })).toBeVisible()
  })

  test('カルーセルの「すべて」リンクが一覧ページに遷移する', async ({ page }) => {
    await page.locator('a:has-text("すべて")').first().click()
    await expect(page.locator('h1:has-text("アニメ一覧")')).toBeVisible()
  })
})
