import { describe, expect, test } from 'bun:test'
import { AmazonProvider } from '../src/lib/providers/amazon'
import { BrowseHTMLSchema } from '../src/schemas/providers/amazon.dto'

describe('browse expiring (offline)', () => {
  test('parses fixture HTML', async () => {
    const html = await Bun.file(`${import.meta.dir}/fixtures/amazon/browse-expiring.html`).text()

    const scripts = [
      ...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)
    ].sort((a, b) => b[1].length - a[1].length)

    let titles: ReturnType<typeof BrowseHTMLSchema.parse> | undefined
    for (const [, content] of scripts) {
      if (!content.includes('titleID')) continue
      titles = BrowseHTMLSchema.parse(JSON.parse(content))
      break
    }

    expect(titles).toBeDefined()
    expect(titles!.length).toBeGreaterThan(0)

    const withExpiring = titles!.filter((t) => t.expiring)
    expect(withExpiring.length).toBeGreaterThan(0)

    for (const t of withExpiring) {
      expect(t.expiring!.remainingHours).toBeGreaterThan(0)
    }
  })
})

describe('browse expiring (online)', () => {
  test('fetches and parses expiring titles', async () => {
    const provider = new AmazonProvider()
    const titles = await provider.fetchTitleList({ expiringOnly: true })

    expect(titles.length).toBeGreaterThan(0)

    const withExpiring = titles.filter((t) => t.expiring)
    expect(withExpiring.length).toBeGreaterThan(0)

    for (const t of withExpiring) {
      expect(t.contentId).toBeTruthy()
      expect(t.title).toBeTruthy()
      expect(t.expiring!.remainingHours).toBeGreaterThan(0)
    }
  }, 30_000)
})
