import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import { currentSeasonSlugs } from '../src/lib/providers/hulu/browse'

describe('currentSeasonSlugs', () => {
  test('冬の最初の月（1月）→ 冬のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-01-15'))).toEqual(['january-march-quarter-anime26'])
  })

  test('冬の中間月（2月）→ 冬のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-02-10'))).toEqual(['january-march-quarter-anime26'])
  })

  test('冬の最終月（3月）→ 冬 + 春', () => {
    expect(currentSeasonSlugs(dayjs('2026-03-25'))).toEqual([
      'january-march-quarter-anime26',
      'april-june-quarter-anime26'
    ])
  })

  test('春の最初の月（4月）→ 春のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-04-01'))).toEqual(['april-june-quarter-anime26'])
  })

  test('春の最終月（6月）→ 春 + 夏', () => {
    expect(currentSeasonSlugs(dayjs('2026-06-15'))).toEqual([
      'april-june-quarter-anime26',
      'july-september-quarter-anime26'
    ])
  })

  test('夏の最初の月（7月）→ 夏のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-07-01'))).toEqual(['july-september-quarter-anime26'])
  })

  test('夏の最終月（9月）→ 夏 + 秋', () => {
    expect(currentSeasonSlugs(dayjs('2026-09-20'))).toEqual([
      'july-september-quarter-anime26',
      'october-december-quarter-anime26'
    ])
  })

  test('秋の最初の月（10月）→ 秋のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-10-01'))).toEqual(['october-december-quarter-anime26'])
  })

  test('秋の最終月（12月）→ 秋 + 翌年冬', () => {
    expect(currentSeasonSlugs(dayjs('2026-12-01'))).toEqual([
      'october-december-quarter-anime26',
      'january-march-quarter-anime27'
    ])
  })
})
