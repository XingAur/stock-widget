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

  it('estimates stock daily profit from price change times shares, not current value', () => {
    // 10 → 12 元、100 股：当日收益应为 (12-10)*100=200，而不是 1200*20%=240
    expect(calculateStockAccountSummary(
      { '000001': { costPrice: 10, shares: 100 } },
      [{ code: '000001', price: 12, prevClose: 10 }]
    )).toEqual({
      accountAssets: 1200,
      estimatedDailyProfit: 200,
      totalProfit: 200,
      positionCount: 1,
      estimatedDailyProfitCount: 1
    })
  })

  it('summarizes stock account assets, estimated daily profit, and total profit', () => {
    expect(calculateStockAccountSummary(
      {
        '000001': { costPrice: 10, shares: 100 },
        '000002': { costPrice: 5, shares: 200 }
      },
      [
        { code: '000001', price: 12, prevClose: 11.76 },
        { code: '000002', price: 4, prevClose: 4.04 }
      ]
    )).toEqual({
      accountAssets: 2000,
      estimatedDailyProfit: 16,
      totalProfit: 0,
      positionCount: 2,
      estimatedDailyProfitCount: 2
    })
  })

  it('drops stock daily estimate when prev close is missing', () => {
    expect(calculateStockAccountSummary(
      { '000001': { costPrice: 10, shares: 100 } },
      [{ code: '000001', price: 12 }]
    )).toMatchObject({ estimatedDailyProfit: null, estimatedDailyProfitCount: 0 })
  })

  it('calculates fund cost from holding amount and cumulative profit', () => {
    expect(calculateFundPositionMetrics({ holdingAmount: 1200, profit: 200 })).toEqual({
      costAmount: 1000,
      currentValue: 1200,
      profit: 200,
      profitPercent: 20
    })
  })

  it('estimates fund daily profit from NAV change times shares, not current value', () => {
    // 昨净 2、估算 2.028、1000 份：当日收益 = 0.028*1000 = 28，而不是 2028*1.4%≈28.39
    expect(calculateFundAccountSummary(
      { '014855': { shares: 1000, currentValue: 2028, profit: 182.93 } },
      [{ code: '014855', estimateNav: 2.028, officialNav: 2 }]
    )).toEqual({
      accountAssets: 2028,
      estimatedDailyProfit: 28,
      totalProfit: 182.93,
      positionCount: 1,
      estimatedDailyProfitCount: 1
    })
  })

  it('summarizes fund account assets, estimated daily profit, and total profit', () => {
    expect(calculateFundAccountSummary(
      {
        '014855': { shares: 9000, currentValue: 18000, profit: 182.93 },
        '024424': { shares: 1000, currentValue: 2000, profit: -30 }
      },
      [
        { code: '014855', estimateNav: 2.027, officialNav: 2 },
        { code: '024424', estimateNav: 1.999, officialNav: 2 }
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
      { '014855': { shares: 9000, currentValue: 18000, profit: 182.93 } },
      [{ code: '014855', estimateNav: null, officialNav: 2 }]
    )).toEqual({
      accountAssets: 18000,
      estimatedDailyProfit: null,
      totalProfit: 182.93,
      positionCount: 1,
      estimatedDailyProfitCount: 0
    })
  })

  it('cannot estimate daily profit for legacy positions without shares', () => {
    expect(calculateFundAccountSummary(
      { '014855': { shares: null, currentValue: 18000, profit: 182.93 } },
      [{ code: '014855', estimateNav: 2.0269, officialNav: 2 }]
    )).toMatchObject({ estimatedDailyProfit: null, estimatedDailyProfitCount: 0 })
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
