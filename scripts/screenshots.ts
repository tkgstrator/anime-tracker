import { type Page, chromium } from 'playwright'
import sharp from 'sharp'

const BASE_URL = 'http://localhost:25173'
const VIEWPORT = { width: 1440, height: 900 }
const OUT_DIR = 'docs/screenshots'

const HIDE_DEVTOOLS_CSS = `
  .tsrd-open-btn-container, .tsqd-open-btn-container,
  [class*="TanStackRouterDevtools"], [class*="ReactQueryDevtools"] {
    display: none !important;
  }
`

async function waitForImages(page: Page, timeout = 10_000) {
  await page.evaluate(async (ms) => {
    const images = Array.from(document.querySelectorAll('img'))
    const deadline = new Promise<void>((resolve) => setTimeout(resolve, ms))
    const loaded = Promise.all(
      images.map(
        (img) =>
          img.complete ||
          new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          })
      )
    )
    await Promise.race([loaded, deadline])
  }, timeout)
}

async function saveWebp(pngBuffer: Buffer, path: string) {
  await sharp(pngBuffer).webp({ quality: 85 }).toFile(path)
}

async function main() {
  const browser = await chromium.launch()
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    colorScheme: 'dark'
  })
  const page = await context.newPage()

  async function capture(url: string, name: string) {
    await page.goto(url)
    await page.waitForLoadState('load')
    await page.addStyleTag({ content: HIDE_DEVTOOLS_CSS })
    await waitForImages(page)
    await page.waitForTimeout(300)
    const buf = await page.screenshot({ type: 'png' })
    await saveWebp(buf, `${OUT_DIR}/${name}.webp`)
  }

  await capture(BASE_URL, 'home')
  await capture(`${BASE_URL}/browse`, 'browse')

  // Anime detail — click the first anime card then scroll to trigger lazy images
  const firstCard = page.locator('main a[href*="/anime/"]').first()
  if (await firstCard.isVisible()) {
    await firstCard.click()
    await page.waitForLoadState('load')
    await page.addStyleTag({ content: HIDE_DEVTOOLS_CSS })
    await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight))
    await page.waitForLoadState('load')
    await waitForImages(page)
    await page.evaluate(() => window.scrollTo(0, 0))
    await page.waitForTimeout(300)
    const buf = await page.screenshot({ type: 'png' })
    await saveWebp(buf, `${OUT_DIR}/anime-detail.webp`)
  }

  await capture(`${BASE_URL}/recordings`, 'recordings')

  await browser.close()
  console.log('Screenshots saved to docs/screenshots/')
}

main()
