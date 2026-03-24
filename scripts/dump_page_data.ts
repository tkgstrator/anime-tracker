const AMAZON_DETAIL_BASE = 'https://www.amazon.co.jp/gp/video/detail'
const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'ja',
}

const titleId = process.argv[2] || 'B0CJRFZ6JD'
const res = await fetch(`${AMAZON_DETAIL_BASE}/${titleId}`, { headers: FETCH_HEADERS })
const html = await res.text()

// Extract the full seasons JSON block
const seasonsMatch = html.match(/"seasons"\s*:\s*\{/)
if (seasonsMatch?.index != null) {
  // Find the matching closing brace
  let depth = 0
  let start = seasonsMatch.index + '"seasons":'.length
  for (let i = start; i < html.length; i++) {
    if (html[i] === '{') depth++
    if (html[i] === '}') depth--
    if (depth === 0) {
      const seasonsJson = html.slice(start, i + 1)
      const parsed = JSON.parse(seasonsJson)
      console.log(JSON.stringify(parsed, null, 2))
      break
    }
  }
}
