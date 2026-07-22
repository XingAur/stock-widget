import { describe, expect, it } from 'vitest'
import {
  calculateBuyPreview,
  calculateSellPreview,
  findNavOnOrBefore,
  validateFundPositionForm
} from './fundValidation'

describe('fund position form validation', () => {
  it('validates buy amount, NAV, fee and future dates', () => {
    expect(validateFundPositionForm('buy', {
      amount: 0,
      nav: -1,
      feeRate: 101,
      tradeDate: '2026-07-23'
    }, 0, '2026-07-22')).toEqual(expect.arrayContaining([
      '加仓金额必须大于 0',
      '确认净值必须大于 0',
      '费率必须在 0% 到 100% 之间',
      '交易日期不能晚于今天'
    ]))
  })

  it('rejects a sale larger than the available shares', () => {
    expect(validateFundPositionForm('sell', {
      shares: 101,
      nav: 2,
      feeRate: 0,
      tradeDate: '2026-07-22'
    }, 100, '2026-07-22')).toContain('卖出份额不能超过可用份额 100')
  })

  it('requires a positive adjustment cost while allowing negative profit', () => {
    expect(validateFundPositionForm('adjust', {
      holdingAmount: 100,
      holdingProfit: 100,
      nav: 2,
      tradeDate: '2026-07-22'
    }, 0, '2026-07-22')).toContain('持仓成本必须大于 0')
  })

  it('rejects transactions dated before a migrated ledger baseline', () => {
    expect(validateFundPositionForm('buy', {
      amount: 100,
      nav: 2,
      feeRate: 0,
      tradeDate: '2026-07-20'
    }, 0, '2026-07-22', '2026-07-21')).toContain('交易日期不能早于账本期初 2026-07-21')
  })
})

describe('fund transaction previews', () => {
  it('calculates buy fee and confirmed shares from total outflow', () => {
    expect(calculateBuyPreview(1000, 1, 2)).toEqual({ fee: 10, shares: 495 })
  })

  it('calculates net sale proceeds and realized profit', () => {
    expect(calculateSellPreview(100, 3, 1, 2)).toEqual({
      fee: 3,
      proceeds: 297,
      realizedProfit: 97
    })
  })

  it('matches the nearest official NAV on or before a non-trading day', () => {
    expect(findNavOnOrBefore([
      { date: '2026-07-17', nav: 1.9 },
      { date: '2026-07-20', nav: 2 }
    ], '2026-07-19')).toEqual({ date: '2026-07-17', nav: 1.9, shifted: true })
  })
})
