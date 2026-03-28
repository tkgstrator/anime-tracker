import { describe, expect, test } from 'bun:test'
import { AmazonProvider } from '../src/lib/providers/amazon'

describe('browse expiring (online)', () => {
  test('fetches and parses expiring titles', async () => {
    const provider = new AmazonProvider()
    const titles = await provider.fetchTitleList({ category: 'expiring' })

    expect(titles.length).toBeGreaterThan(0)

    const withExpiring = titles.filter((t) => t.expiring)
    expect(withExpiring.length).toBeGreaterThan(0)

    for (const t of withExpiring) {
      expect(t.contentId).toBeTruthy()
      expect(t.title).toBeTruthy()
      expect(t.expiring?.remainingHours).toBeGreaterThan(0)
    }
  }, 30_000)
})
