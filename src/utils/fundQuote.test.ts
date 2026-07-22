import { describe, expect, it } from 'vitest'
import type { FundQuote } from '../api/stock'
import { estimateDateKey, localDateKey, resolveFundDisplayQuote } from './fundQuote'

const quote: FundQuote = {
  code: '001186',
  name: '富国文体健康股票A',
  nav: 2.376,
  navDate: '2026-07-21',
  changePercent: 1.54,
  estimateNav: 2.4,
  estimateChangePercent: 1.01,
  estimateTime: '2026-07-22 10:31:00'
}

describe('fund quote display resolution', () => {
  it('uses an estimate from the current local day', () => {
    expect(resolveFundDisplayQuote(quote, new Date(2026, 6, 22, 12))).toEqual({
      nav: 2.4,
      changePercent: 1.01,
      time: '2026-07-22 10:31:00',
      source: 'estimate'
    })
  })

  it('falls back to official values when the estimate is stale', () => {
    expect(resolveFundDisplayQuote(
      { ...quote, estimateTime: '2026-07-21 15:00:00' },
      new Date(2026, 6, 22, 12)
    )).toEqual({
      nav: 2.376,
      changePercent: 1.54,
      time: '2026-07-21',
      source: 'official'
    })
  })

  it('falls back when a current estimate NAV is missing', () => {
    expect(resolveFundDisplayQuote(
      { ...quote, estimateNav: null },
      new Date(2026, 6, 22, 12)
    ).source).toBe('official')
  })

  it('normalizes compact provider timestamps without using UTC dates', () => {
    expect(estimateDateKey('20260722103100')).toBe('2026-07-22')
    expect(localDateKey(new Date(2026, 6, 22, 23, 59))).toBe('2026-07-22')
  })
})
