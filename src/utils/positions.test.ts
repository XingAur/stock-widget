import { describe, expect, it } from 'vitest'
import {
  calculateFundAccountSummary,
  calculateFundPositionMetrics,
  calculateStockAccountSummary,
  calculateStockPositionMetrics,
  getProfitTone
} from './positions'

describe('position metrics', () => {
  it('calculates stock profit and percent from cost price, shares, and current price', () => {
    expect(calculateStockPositionMetrics({ costPrice: 10, shares: 100 }, 12)).toEqual({
      costAmount: 1000,
      currentValue: 1200,
      profit: 200,
      profitPercent: 20
    })
  })

  it('calculates stock losses', () => {
    expect(calculateStockPositionMetrics({ costPrice: 10, shares: 100 }, 8)?.profit).toBe(-200)
    expect(calculateStockPositionMetrics({ costPrice: 10, shares: 100 }, 8)?.profitPercent).toBe(-20)
  })

  it('summarizes stock account assets, estimated daily profit, and total profit', () => {
    expect(calculateStockAccountSummary(
      {
        '000001': { costPrice: 10, shares: 100 },
        '000002': { costPrice: 5, shares: 200 }
      },
      [
        { code: '000001', price: 12, changePercent: 2 },
        { code: '000002', price: 4, changePercent: -1 }
      ]
    )).toEqual({
      accountAssets: 2000,
      estimatedDailyProfit: 16,
      totalProfit: 0,
      positionCount: 2,
      estimatedDailyProfitCount: 2
    })
  })

  it('calculates fund cost from holding amount and cumulative profit', () => {
    expect(calculateFundPositionMetrics({ holdingAmount: 1200, profit: 200 })).toEqual({
      costAmount: 1000,
      currentValue: 1200,
      profit: 200,
      profitPercent: 20
    })
  })

  it('summarizes fund account assets, estimated daily profit, and total profit', () => {
    expect(calculateFundAccountSummary(
      {
        '014855': { holdingAmount: 18000, profit: 182.93 },
        '024424': { holdingAmount: 2000, profit: -30 }
      },
      [
        { code: '014855', estimateChangePercent: 1.4 },
        { code: '024424', estimateChangePercent: -0.5 }
      ]
    )).toEqual({
      accountAssets: 20000,
      estimatedDailyProfit: 242,
      totalProfit: 152.93,
      positionCount: 2,
      estimatedDailyProfitCount: 2
    })
  })

  it('keeps fund account summary available when daily estimates are missing', () => {
    expect(calculateFundAccountSummary(
      { '014855': { holdingAmount: 18000, profit: 182.93 } },
      [{ code: '014855', estimateChangePercent: null }]
    )).toEqual({
      accountAssets: 18000,
      estimatedDailyProfit: null,
      totalProfit: 182.93,
      positionCount: 1,
      estimatedDailyProfitCount: 0
    })
  })

  it('returns null when position inputs cannot produce useful metrics', () => {
    expect(calculateStockPositionMetrics({ costPrice: 0, shares: 100 }, 12)).toBeNull()
    expect(calculateStockPositionMetrics({ costPrice: 10, shares: 0 }, 12)).toBeNull()
    expect(calculateStockAccountSummary({}, [])).toBeNull()
    expect(calculateFundPositionMetrics({ holdingAmount: 100, profit: 100 })).toBeNull()
    expect(calculateFundAccountSummary({}, [])).toBeNull()
  })

  it('maps profit value to display tone', () => {
    expect(getProfitTone(1)).toBe('profit')
    expect(getProfitTone(-1)).toBe('loss')
    expect(getProfitTone(0)).toBe('flat')
  })
})
