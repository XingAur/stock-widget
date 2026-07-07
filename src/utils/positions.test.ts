import { describe, expect, it } from 'vitest'
import {
  calculateFundPositionMetrics,
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

  it('calculates fund cost from holding amount and cumulative profit', () => {
    expect(calculateFundPositionMetrics({ holdingAmount: 1200, profit: 200 })).toEqual({
      costAmount: 1000,
      currentValue: 1200,
      profit: 200,
      profitPercent: 20
    })
  })

  it('returns null when position inputs cannot produce useful metrics', () => {
    expect(calculateStockPositionMetrics({ costPrice: 0, shares: 100 }, 12)).toBeNull()
    expect(calculateStockPositionMetrics({ costPrice: 10, shares: 0 }, 12)).toBeNull()
    expect(calculateFundPositionMetrics({ holdingAmount: 100, profit: 100 })).toBeNull()
  })

  it('maps profit value to display tone', () => {
    expect(getProfitTone(1)).toBe('profit')
    expect(getProfitTone(-1)).toBe('loss')
    expect(getProfitTone(0)).toBe('flat')
  })
})
