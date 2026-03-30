import { describe, expect, test } from 'bun:test'
import dayjs from 'dayjs'
import { currentSeasonSlugs } from '../../../src/lib/providers/hulu/browse'

describe('currentSeasonSlugs', () => {
  test('1月: 冬のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-01-15'))).toEqual(['january-march-quarter-anime26'])
  })

  test('2月: 冬のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-02-10'))).toEqual(['january-march-quarter-anime26'])
  })

  test('3月: 冬 + 春', () => {
    expect(currentSeasonSlugs(dayjs('2026-03-25'))).toEqual([
      'january-march-quarter-anime26',
      'april-june-quarter-anime26'
    ])
  })

  test('4月: 春のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-04-01'))).toEqual(['april-june-quarter-anime26'])
  })

  test('6月: 春 + 夏', () => {
    expect(currentSeasonSlugs(dayjs('2026-06-15'))).toEqual([
      'april-june-quarter-anime26',
      'july-september-quarter-anime26'
    ])
  })

  test('7月: 夏のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-07-01'))).toEqual(['july-september-quarter-anime26'])
  })

  test('9月: 夏 + 秋', () => {
    expect(currentSeasonSlugs(dayjs('2026-09-20'))).toEqual([
      'july-september-quarter-anime26',
      'october-december-quarter-anime26'
    ])
  })

  test('10月: 秋のみ', () => {
    expect(currentSeasonSlugs(dayjs('2026-10-01'))).toEqual(['october-december-quarter-anime26'])
  })

  test('12月: 秋 + 翌年冬', () => {
    expect(currentSeasonSlugs(dayjs('2026-12-01'))).toEqual([
      'october-december-quarter-anime26',
      'january-march-quarter-anime27'
    ])
  })
})
