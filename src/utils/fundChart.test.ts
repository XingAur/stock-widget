import { describe, expect, it } from 'vitest'
import type { FundDailySnapshot } from './fundLedger'
import {
  calculateFundRangeReturn,
  createIncomeSeries,
  createLinePath,
  createPerformanceSeries,
  filterDatedValuesByRange,
  filterFundNavPointsByRange
} from './fundChart'

describe('fund performance chart model', () => {
  it('calculates the trailing one-year return from official NAV history', () => {
    expect(calculateFundRangeReturn([
      { date: '2025-07-22', nav: 1.2668 },
      { date: '2026-01-19', nav: 2.4 },
      { date: '2026-07-22', nav: 3.5368 }
    ], '1y')).toBe(179.19)
  })

  it('returns null when a range does not contain two valid NAV points', () => {
    expect(calculateFundRangeReturn([
      { date: '2026-07-22', nav: 3.5368 }
    ], '1y')).toBeNull()
  })

  it('normalizes fund and benchmark values from their first common date', () => {
    const model = createPerformanceSeries(
      [
        { date: '2026-07-20', nav: 2 },
        { date: '2026-07-21', nav: 2.2 },
        { date: '2026-07-22', nav: 2.4 }
      ],
      [
        { date: '2026-07-19', value: 90 },
        { date: '2026-07-20', value: 100 },
        { date: '2026-07-22', value: 105 }
      ],
      'all'
    )

    expect(model?.fund).toEqual([
      { date: '2026-07-20', value: 0 },
      { date: '2026-07-22', value: 20 }
    ])
    expect(model?.benchmark).toEqual([
      { date: '2026-07-20', value: 0 },
      { date: '2026-07-22', value: 5 }
    ])
  })

  it('returns null when there are not enough common points', () => {
    expect(createPerformanceSeries(
      [{ date: '2026-07-20', nav: 2 }],
      [{ date: '2026-07-21', value: 100 }],
      'all'
    )).toBeNull()
  })

  it('filters dated values from the newest point for a selected range', () => {
    const filtered = filterDatedValuesByRange([
      { date: '2026-01-01', value: 1 },
      { date: '2026-04-01', value: 2 },
      { date: '2026-06-15', value: 3 },
      { date: '2026-07-21', value: 4 }
    ], '3m')

    expect(filtered.map((point) => point.date)).toEqual(['2026-06-15', '2026-07-21'])
  })

  it('filters full nav rows by the selected range without losing nav fields', () => {
    const filtered = filterFundNavPointsByRange([
      { date: '2026-01-01', nav: 1, accumulatedNav: 1.1, changePercent: null },
      { date: '2026-06-25', nav: 2, accumulatedNav: 2.2, changePercent: -1.25 },
      { date: '2026-07-21', nav: 3, accumulatedNav: 3.3, changePercent: 2.5 }
    ], '1m')

    expect(filtered).toEqual([
      { date: '2026-06-25', nav: 2, accumulatedNav: 2.2, changePercent: -1.25 },
      { date: '2026-07-21', nav: 3, accumulatedNav: 3.3, changePercent: 2.5 }
    ])
  })
})

describe('fund income chart model', () => {
  it('maps snapshots to a dated cumulative-profit series', () => {
    const snapshots: FundDailySnapshot[] = [
      {
        date: '2026-07-21', officialNav: 2, shares: 500, remainingCost: 1000,
        marketValue: 1000, realizedProfit: 0, totalProfit: 0, dailyProfit: null, hasAdjustment: false
      },
      {
        date: '2026-07-22', officialNav: 2.2, shares: 500, remainingCost: 1000,
        marketValue: 1100, realizedProfit: 0, totalProfit: 100, dailyProfit: 100, hasAdjustment: false
      }
    ]

    expect(createIncomeSeries(snapshots, 'all')).toEqual([
      { date: '2026-07-21', value: 0 },
      { date: '2026-07-22', value: 100 }
    ])
  })

  it('creates a finite SVG path for flat values', () => {
    const path = createLinePath([
      { date: '2026-07-21', value: 5 },
      { date: '2026-07-22', value: 5 }
    ], 300, 120, 12)

    expect(path).toMatch(/^M /)
    expect(path).not.toContain('NaN')
    expect(path).not.toContain('Infinity')
  })
})
