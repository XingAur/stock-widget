import { describe, expect, it } from 'vitest'
import {
  addFundTransaction,
  createEmptyFundLedger,
  createLedgerFromLegacyPosition,
  deriveFundPosition,
  rebuildFundSnapshots,
  removeFundTransaction,
  replaceFundTransaction
} from './fundLedger'

describe('fund ledger migration', () => {
  it('creates a dated baseline without inventing earlier transactions', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: -100 },
      '2026-07-21',
      2
    )

    expect(ledger.baseline).toEqual({
      date: '2026-07-21',
      nav: 2,
      holdingAmount: 1000,
      holdingProfit: -100,
      shares: 500,
      costAmount: 1100
    })
    expect(ledger.transactions).toEqual([])
    expect(ledger.snapshots).toEqual([
      {
        date: '2026-07-21',
        officialNav: 2,
        shares: 500,
        remainingCost: 1100,
        marketValue: 1000,
        realizedProfit: 0,
        totalProfit: -100,
        dailyProfit: null,
        hasAdjustment: false
      }
    ])
  })

  it('supports the first buy for a fund without a legacy position', () => {
    const empty = createEmptyFundLedger('001186', '2026-07-22', 2)
    const next = addFundTransaction(empty, {
      id: 'first-buy',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    expect(deriveFundPosition(next, 2)).toMatchObject({ shares: 50, currentValue: 100, remainingCost: 100 })
  })
})

describe('fund ledger transactions', () => {
  it('charges buy fees with the regulator-mandated external method', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )

    const next = addFundTransaction(ledger, {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 1,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    // 外扣法：净申购金额 = 100 / 1.01 = 99.01，申购费 = 0.99，份额 = 99.01 / 2
    expect(next.transactions[0]).toMatchObject({
      type: 'buy',
      fee: 0.99,
      shares: 49.505
    })
    expect(deriveFundPosition(next, 2)).toMatchObject({
      shares: 549.505,
      currentValue: 1099.01,
      remainingCost: 1100,
      holdingProfit: -0.99,
      totalProfit: -0.99
    })
  })

  it('uses moving-average cost and records realized profit for a sell', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )

    const next = addFundTransaction(ledger, {
      id: 'sell-1',
      type: 'sell',
      tradeDate: '2026-07-22',
      nav: 3,
      shares: 100,
      feeRate: 1,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    expect(next.transactions[0]).toMatchObject({
      type: 'sell',
      fee: 3,
      proceeds: 297,
      realizedProfit: 97
    })
    expect(deriveFundPosition(next, 3)).toMatchObject({
      shares: 400,
      currentValue: 1200,
      remainingCost: 800,
      holdingProfit: 400,
      realizedProfit: 97,
      totalProfit: 497,
      costNav: 2
    })
  })

  it('resets the calculation baseline when the holding is adjusted', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )

    const next = addFundTransaction(ledger, {
      id: 'adjust-1',
      type: 'adjustment',
      tradeDate: '2026-07-22',
      nav: 1.8,
      holdingAmount: 900,
      holdingProfit: -100,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    expect(next.transactions[0]).toMatchObject({
      type: 'adjustment',
      shares: 500,
      resetCostAmount: 1000
    })
    expect(deriveFundPosition(next, 1.8)).toMatchObject({
      shares: 500,
      currentValue: 900,
      remainingCost: 1000,
      holdingProfit: -100,
      realizedProfit: 0,
      totalProfit: -100
    })
  })

  it('clears floating-point residue when all shares are sold', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )

    const next = addFundTransaction(ledger, {
      id: 'sell-all',
      type: 'sell',
      tradeDate: '2026-07-22',
      nav: 2.2,
      shares: 500,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    expect(deriveFundPosition(next, 2.2)).toMatchObject({
      shares: 0,
      currentValue: 0,
      remainingCost: 0,
      holdingProfit: 0,
      realizedProfit: 100,
      totalProfit: 100,
      costNav: null
    })
  })

  it('replays the ledger after a transaction is edited or deleted', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )
    const withBuy = addFundTransaction(ledger, {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    const edited = replaceFundTransaction(withBuy, 'buy-1', {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 200,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })
    expect(deriveFundPosition(edited, 2)).toMatchObject({ shares: 600, currentValue: 1200 })

    const removed = removeFundTransaction(edited, 'buy-1')
    expect(deriveFundPosition(removed, 2)).toMatchObject({ shares: 500, currentValue: 1000 })
  })
})

describe('fund ledger snapshots', () => {
  it('rebuilds official daily profit from transactions and NAV history', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )
    const withBuy = addFundTransaction(ledger, {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    const rebuilt = rebuildFundSnapshots(withBuy, [
      { date: '2026-07-21', nav: 2 },
      { date: '2026-07-22', nav: 2 },
      { date: '2026-07-23', nav: 2.2 }
    ])

    expect(rebuilt.snapshots).toEqual([
      expect.objectContaining({ date: '2026-07-21', totalProfit: 0, dailyProfit: null }),
      expect.objectContaining({ date: '2026-07-22', shares: 550, totalProfit: 0, dailyProfit: 0 }),
      expect.objectContaining({ date: '2026-07-23', marketValue: 1210, totalProfit: 110, dailyProfit: 110 })
    ])
  })

  it('marks an adjustment day instead of counting the correction as daily profit', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )
    const adjusted = addFundTransaction(ledger, {
      id: 'adjust-1',
      type: 'adjustment',
      tradeDate: '2026-07-22',
      nav: 2,
      holdingAmount: 1200,
      holdingProfit: 200,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    const rebuilt = rebuildFundSnapshots(adjusted, [
      { date: '2026-07-21', nav: 2 },
      { date: '2026-07-22', nav: 2 }
    ])

    expect(rebuilt.snapshots[1]).toMatchObject({
      totalProfit: 200,
      dailyProfit: null,
      hasAdjustment: true
    })
  })

  it('computes daily profit as NAV change times previous-day shares (Alipay-style)', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )
    // 7-22 买入 100 元（费率 1%），7-23 净值涨到 2.2
    const withBuy = addFundTransaction(ledger, {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 1,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    const rebuilt = rebuildFundSnapshots(withBuy, [
      { date: '2026-07-21', nav: 2 },
      { date: '2026-07-22', nav: 2 },
      { date: '2026-07-23', nav: 2.2 }
    ])

    // 买入日：当日收益 =（2-2）× 昨日 500 份 = 0，申购费不计入当日收益
    expect(rebuilt.snapshots[1]).toMatchObject({ dailyProfit: 0 })
    // 次日：当日收益 =（2.2-2）× 549.505 份（外扣法确认）= 109.9
    expect(rebuilt.snapshots[2]).toMatchObject({ dailyProfit: 109.9 })
  })

  it('counts a partial sell toward the sell-day NAV change only', () => {
    const ledger = createLedgerFromLegacyPosition(
      '001186',
      { holdingAmount: 1000, profit: 0 },
      '2026-07-21',
      2
    )
    const withSell = addFundTransaction(ledger, {
      id: 'sell-1',
      type: 'sell',
      tradeDate: '2026-07-22',
      nav: 2.2,
      shares: 100,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    const rebuilt = rebuildFundSnapshots(withSell, [
      { date: '2026-07-21', nav: 2 },
      { date: '2026-07-22', nav: 2.2 }
    ])

    // 卖出日：当日收益 =（2.2-2）× 昨日 500 份 = 100，
    // 已实现利润（相对成本的 20 元）不再混入当日收益
    expect(rebuilt.snapshots[1]).toMatchObject({ dailyProfit: 100, realizedProfit: 20 })
  })
})
