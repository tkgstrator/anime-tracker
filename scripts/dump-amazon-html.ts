import { buildAmazonBrowseUrl } from '../src/lib/providers/amazon/browse'
import { FETCH_HEADERS } from '../src/lib/providers/amazon/detail'

const url = buildAmazonBrowseUrl()
console.log('Fetching:', url)

const res = await fetch(url, { headers: FETCH_HEADERS })
if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText}`)
  process.exit(1)
}

const html = await res.text()
const outPath = 'tmp/amazon-browse.html'
await Bun.write(outPath, html)
console.log(`Saved to ${outPath} (${html.length} bytes)`)
