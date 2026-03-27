import { describe, expect, test } from 'bun:test'
import { parseExpiringMessage } from '../src/lib/providers/amazon/expiring'

describe('parseExpiringMessage', () => {
  const cases: [string, { season: number | null; remainingHours: number } | null][] = [
    // シーズン付き・日単位
    ['シーズン1のPrimeでの配信は6日以内に終了', { season: 1, remainingHours: 144 }],
    ['シーズン1のPrimeでの配信は9日以内に終了', { season: 1, remainingHours: 216 }],
    ['シーズン1のPrimeでの配信は3日以内に終了', { season: 1, remainingHours: 72 }],
    ['シーズン1のPrimeでの配信は8日以内に終了', { season: 1, remainingHours: 192 }],
    ['シーズン1のPrimeでの配信は14日以内に終了', { season: 1, remainingHours: 336 }],
    ['シーズン1のPrimeでの配信は4日以内に終了', { season: 1, remainingHours: 96 }],
    ['シーズン1のPrimeでの配信は5日以内に終了', { season: 1, remainingHours: 120 }],
    ['シーズン1のPrimeでの配信は10日以内に終了', { season: 1, remainingHours: 240 }],
    ['シーズン2のPrimeでの配信は6日以内に終了', { season: 2, remainingHours: 144 }],
    ['シーズン6のPrimeでの配信は7日以内に終了', { season: 6, remainingHours: 168 }],

    // シーズン付き・時間単位
    ['シーズン1のPrimeでの配信は34時間以内に終了', { season: 1, remainingHours: 34 }],

    // 時間+分単位
    ['シーズン1のPrimeでの配信は3時間13分以内に終了', { season: 1, remainingHours: 3 }],
    ['Primeでの配信は12時間45分以内に終了', { season: null, remainingHours: 12 }],

    // 分単位のみ
    ['シーズン1のPrimeでの配信は174分以内に終了', { season: 1, remainingHours: 3 }],
    ['Primeでの配信は30分以内に終了', { season: null, remainingHours: 1 }],

    // シーズンなし・日単位
    ['Primeでの配信は6日以内に終了', { season: null, remainingHours: 144 }],
    ['Primeでの配信は9日以内に終了', { season: null, remainingHours: 216 }],
    ['Primeでの配信は5日以内に終了', { season: null, remainingHours: 120 }],
    ['Primeでの配信は14日以内に終了', { season: null, remainingHours: 336 }],

    // 配信終了と無関係なメッセージ
    ['サブスクリプションのTV番組で第9位', null],
    ['', null]
  ]

  for (const [message, expected] of cases) {
    test(`"${message}" => ${JSON.stringify(expected)}`, () => {
      expect(parseExpiringMessage(message)).toEqual(expected)
    })
  }
})
