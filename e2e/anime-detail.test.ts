import { expect, test } from '@playwright/test'

test.describe('アニメ詳細ページ', () => {
  test.beforeEach(async ({ page }) => {
    // 一覧から最初のアニメの詳細に遷移
    await page.goto('/browse')
    await page.locator('main a[href*="/anime/"]').first().click()
    await expect(page.locator('a:has-text("← 一覧に戻る")')).toBeVisible()
  })

  test('アニメ情報が表示される', async ({ page }) => {
    // タイトル（h1）が存在する
    await expect(page.locator('main h1').first()).toBeVisible()
    // プロバイダバッジが存在する
    await expect(page.locator('main').locator('text=/Prime Video|Hulu|Crunchyroll|Netflix/')).toBeVisible()
  })

  test('エピソード一覧またはメッセージが表示される', async ({ page }) => {
    // エピソードグリッドまたは「エピソード情報はまだありません」のいずれか
    const episodes = page.locator('main h2')
    const emptyMsg = page.locator('text=エピソード情報はまだありません')
    const hasEpisodes = (await episodes.count()) > 0
    const hasEmptyMsg = await emptyMsg.isVisible().catch(() => false)
    expect(hasEpisodes || hasEmptyMsg).toBeTruthy()
  })

  test('「一覧に戻る」リンクでホームに戻れる', async ({ page }) => {
    await page.locator('a:has-text("← 一覧に戻る")').click()
    await expect(page).toHaveURL('/')
  })
})
