import { describe, expect, it } from 'vitest'
import type { FundQuote, FundSearchResult } from '../api/stock'
import { applyFundDisplayName, findExactFundSearchResult } from './funds'

const quote: FundQuote = {
  code: '014855',
  name: 'garbled-name',
  nav: 3.8307,
  navDate: '2026-07-06',
  estimateNav: 3.8843,
  estimateChangePercent: 1.4,
  estimateTime: '2026-07-07 15:00'
}

describe('fund helpers', () => {
  it('finds an exact fund search result by code', () => {
    const results: FundSearchResult[] = [
      { code: '510300', name: 'CSI 300 ETF', type: 'Index' },
      { code: '014855', name: 'Open Fund C', type: 'Index' }
    ]

    expect(findExactFundSearchResult(results, '014855')).toEqual(results[1])
    expect(findExactFundSearchResult(results, '14855')).toBeNull()
  })

  it('prefers search result name over quote name', () => {
    expect(applyFundDisplayName(quote, { code: '014855', name: 'Open Fund C', type: 'Index' }).name)
      .toBe('Open Fund C')
  })

  it('keeps existing display name during refresh when no search result is present', () => {
    expect(applyFundDisplayName(quote, undefined, { ...quote, name: 'Existing Name' }).name)
      .toBe('Existing Name')
  })
})
