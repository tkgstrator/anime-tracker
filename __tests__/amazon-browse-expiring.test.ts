import { describe, expect, test } from 'bun:test'
import { BrowseHTMLSchema } from '../src/schemas/providers/amazon.dto'

describe('browse expiring (offline)', () => {
  test('parses fixture HTML', async () => {
    const html = await Bun.file(`${import.meta.dir}/fixtures/amazon/browse-expiring.html`).text()

    const scripts = [...html.matchAll(/<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)].sort(
      (a, b) => b[1].length - a[1].length
    )

    let titles: ReturnType<typeof BrowseHTMLSchema.parse> | undefined
    for (const [, content] of scripts) {
      if (!content.includes('titleID')) continue
      titles = BrowseHTMLSchema.parse(JSON.parse(content))
      break
    }

    expect(titles).toBeDefined()
    if (!titles) return
    expect(titles.length).toBeGreaterThan(0)

    const withExpiring = titles.filter((t) => t.expiring)
    expect(withExpiring.length).toBeGreaterThan(0)

    for (const t of withExpiring) {
      expect(t.expiring?.remainingHours).toBeGreaterThan(0)
    }
  })
})
