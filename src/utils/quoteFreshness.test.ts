import { describe, expect, it } from 'vitest'
import { freshnessLevel, parseQuoteSourceTime, quoteAgeMs } from './quoteFreshness'

describe('quoteFreshness', () => {
  it('parses Tencent 14-digit timestamps as Shanghai time', () => {
    const source = parseQuoteSourceTime('20260924103602')
    expect(source?.toISOString()).toBe('2026-09-24T02:36:02.000Z')
  })

  it('classifies live delayed and stale during the continuous session', () => {
    const now = new Date('2026-09-24T02:36:02.000Z')
    expect(freshnessLevel(quoteAgeMs('20260924103602', now), now)).toBe('live')
    expect(freshnessLevel(90_000, now)).toBe('delayed')
    expect(freshnessLevel(200_000, now)).toBe('stale')
  })
})
