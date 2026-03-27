import { describe, expect, test } from 'bun:test'
import { buildAmazonUrl, buildHuluUrl } from '../src/routes/img'

describe('buildAmazonUrl', () => {
  const hash = '01c42b6efbb97a490a2f2f1afda966edeba2354200fdb88dad10f1a6f3f82edd'

  test('basic jpg', () => {
    expect(buildAmazonUrl(hash, 'jpg', {})).toBe(`https://m.media-amazon.com/images/S/pv-target-images/${hash}.jpg`)
  })

  test('basic png', () => {
    expect(buildAmazonUrl(hash, 'png', {})).toBe(`https://m.media-amazon.com/images/S/pv-target-images/${hash}.png`)
  })

  test('with width', () => {
    expect(buildAmazonUrl(hash, 'jpg', { w: '500' })).toBe(
      `https://m.media-amazon.com/images/S/pv-target-images/${hash}._SX500_.jpg`
    )
  })

  test('with quality', () => {
    expect(buildAmazonUrl(hash, 'png', { q: '80' })).toBe(
      `https://m.media-amazon.com/images/S/pv-target-images/${hash}._QL80_.png`
    )
  })

  test('with width and quality', () => {
    expect(buildAmazonUrl(hash, 'jpg', { w: '500', q: '80' })).toBe(
      `https://m.media-amazon.com/images/S/pv-target-images/${hash}._QL80_SX500_.jpg`
    )
  })
})

describe('buildHuluUrl', () => {
  const uuid = 'd0a287e1-1f41-4c24-996e-9f9ffdccf415'

  test('basic jpg', () => {
    expect(buildHuluUrl(uuid, 'jpg', {})).toBe(`https://images.prod.hjholdings.tv/d3urerHm/uploads/${uuid}.jpg`)
  })

  test('basic png', () => {
    expect(buildHuluUrl(uuid, 'png', {})).toBe(`https://images.prod.hjholdings.tv/d3urerHm/uploads/${uuid}.png`)
  })

  test('with params', () => {
    expect(buildHuluUrl(uuid, 'jpg', { w: '331', h: '447', q: '80' })).toBe(
      `https://images.prod.hjholdings.tv/d3urerHm/uploads/${uuid}.jpg?w=331&h=447&q=80`
    )
  })
})

describe('upstream reachability', () => {
  const amazonSamples = [
    { id: 'b7d30649b4985e8887168764e2d301fa0ce1a67dcc26f1d3a4c06590ccc2c030', ext: 'png' },
    { id: '01c42b6efbb97a490a2f2f1afda966edeba2354200fdb88dad10f1a6f3f82edd', ext: 'jpg' }
  ]

  const huluSamples = [
    { id: 'd0a287e1-1f41-4c24-996e-9f9ffdccf415', ext: 'jpg' },
    { id: '72ba6f1f-43a9-4af5-8872-3677a9244868', ext: 'png' }
  ]

  for (const { id, ext } of amazonSamples) {
    test(`Amazon ${ext}: ${id.slice(0, 12)}...`, async () => {
      const url = buildAmazonUrl(id, ext, { w: '500' })
      const res = await fetch(url, { method: 'HEAD' })
      expect(res.status).toBe(200)
    })
  }

  for (const { id, ext } of huluSamples) {
    test(`Hulu ${ext}: ${id}`, async () => {
      const url = buildHuluUrl(id, ext, { w: '331', h: '447', q: '80' })
      const res = await fetch(url, { method: 'HEAD' })
      expect(res.status).toBe(200)
    })
  }
})
