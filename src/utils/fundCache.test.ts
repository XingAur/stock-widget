import { describe, expect, it } from 'vitest'
import { readFundDetailCache, shouldRefreshFundHistory, writeFundDetailCache } from './fundCache'

function storage(): Pick<Storage, 'getItem' | 'setItem'> {
  const values = new Map<string, string>()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }
}

describe('fund detail cache', () => {
  it('returns a same-day entry while it is within the TTL', () => {
    const target = storage()
    const savedAt = new Date(2026, 6, 22, 9).getTime()
    writeFundDetailCache('history', '001186', [{ date: '2026-07-21', nav: 2 }], savedAt, target)

    expect(readFundDetailCache('history', '001186', 6 * 60 * 60 * 1000, savedAt + 1000, target)).toMatchObject({
      value: [{ date: '2026-07-21', nav: 2 }],
      savedAt,
      isFresh: true
    })
  })

  it('forces a refresh across a local calendar day even inside the TTL', () => {
    const target = storage()
    const savedAt = new Date(2026, 6, 22, 23, 59).getTime()
    writeFundDetailCache('profile', '001186', { fundType: '混合型' }, savedAt, target)

    expect(readFundDetailCache('profile', '001186', 6 * 60 * 60 * 1000, new Date(2026, 6, 23, 0, 1).getTime(), target)?.isFresh).toBe(false)
  })

  it('keeps stale data available as an offline fallback', () => {
    const target = storage()
    writeFundDetailCache('allocation', '001186', { reportDate: '2026-06-30' }, 1000, target)

    expect(readFundDetailCache('allocation', '001186', 1000, 5000, target)).toMatchObject({
      value: { reportDate: '2026-06-30' },
      isFresh: false
    })
  })

  it('ignores malformed cache entries', () => {
    const target = storage()
    target.setItem('fundDetail:history:001186', '{broken')

    expect(readFundDetailCache('history', '001186', 1000, 5000, target)).toBeNull()
  })

  it('refreshes history when the official quote is newer than the cached NAV', () => {
    const cache = {
      value: [{ date: '2026-07-21', nav: 2 }],
      savedAt: new Date(2026, 6, 22, 10).getTime(),
      isFresh: true
    }

    expect(shouldRefreshFundHistory(cache, '2026-07-22')).toBe(true)
    expect(shouldRefreshFundHistory(cache, '2026-07-21')).toBe(false)
  })
})
