import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFunds, fetchStocks, type FundQuote, type Stock } from '../api/stock'
import { useStockStore } from './stock'

vi.mock('../api/stock', () => ({
  fetchFunds: vi.fn(),
  fetchMinuteData: vi.fn(),
  fetchStocks: vi.fn(),
  searchFunds: vi.fn()
}))

function createLocalStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    }
  }
}

function createStock(overrides: Partial<Stock> = {}): Stock {
  return {
    code: '000001',
    name: '骞冲畨閾惰',
    price: 12,
    change: 0.2,
    changePercent: 1.69,
    high: 12.2,
    low: 11.8,
    open: 11.9,
    prevClose: 11.8,
    volume: 100000,
    amount: 1200000,
    time: '20260709150000',
    totalMarketCap: 100000000,
    circulationMarketCap: 90000000,
    turnoverRate: 1.23,
    volumeRatio: 0.88,
    ...overrides
  }
}

function createFundQuote(overrides: Partial<FundQuote> = {}): FundQuote {
  return {
    code: '001186',
    name: 'Open Fund A',
    nav: 2.376,
    navDate: '2026-07-21',
    changePercent: 1.5385,
    estimateNav: 2.376,
    estimateChangePercent: 1.5385,
    estimateTime: '2026-07-21',
    ...overrides
  }
}

describe('stock store refresh', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorage(),
      configurable: true
    })
    vi.clearAllMocks()
  })

  it('keeps existing stock quotes when a refresh returns no data', async () => {
    const existingStock = createStock()
    const store = useStockStore()
    store.watchList = [existingStock.code]
    store.stocks = new Map([[existingStock.code, existingStock]])
    vi.mocked(fetchStocks).mockResolvedValueOnce([])

    await store.refreshStocks()

    expect(store.stockList).toEqual([existingStock])
    expect(store.stocks.get(existingStock.code)).toEqual(existingStock)
  })

  it('keeps existing fund quotes when a refresh returns no data', async () => {
    const existingFund = createFundQuote()
    const store = useStockStore()
    store.fundWatchList = [existingFund.code]
    store.funds = new Map([[existingFund.code, existingFund]])
    vi.mocked(fetchFunds).mockResolvedValueOnce([])

    await store.refreshFunds()

    expect(store.fundList).toEqual([existingFund])
    expect(store.funds.get(existingFund.code)).toEqual(existingFund)
  })
})

describe('empty fund ledger', () => {
  it('creates a zero baseline only when explicitly requested for a first buy', () => {
    const store = useStockStore()

    expect(store.ensureFundLedger('001186', '2026-07-22', 2)).toBeNull()
    expect(store.ensureFundLedger('001186', '2026-07-22', 2, true)?.baseline).toMatchObject({
      holdingAmount: 0,
      shares: 0,
      costAmount: 0
    })
  })
})

describe('fund ledger storage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorage(),
      configurable: true
    })
    vi.clearAllMocks()
  })

  it('restores a valid versioned ledger from localStorage', () => {
    localStorage.setItem('fundLedgers', JSON.stringify({
      '001186': {
        schemaVersion: 1,
        code: '001186',
        baseline: {
          date: '2026-07-21',
          nav: 2,
          holdingAmount: 1000,
          holdingProfit: 0,
          shares: 500,
          costAmount: 1000
        },
        transactions: [],
        snapshots: []
      }
    }))

    const store = useStockStore()
    store.loadStoredState()

    expect(store.fundLedgers['001186']?.baseline.shares).toBe(500)
  })

  it('migrates a legacy position only once', () => {
    localStorage.setItem('fundPositions', JSON.stringify({
      '001186': { holdingAmount: 1000, profit: -100 }
    }))
    const store = useStockStore()
    store.loadStoredState()

    const first = store.ensureFundLedger('001186', '2026-07-21', 2)
    const second = store.ensureFundLedger('001186', '2026-07-22', 2.1)

    expect(first?.baseline).toMatchObject({ date: '2026-07-21', shares: 500, costAmount: 1100 })
    expect(second).toEqual(first)
    expect(Object.keys(store.fundLedgers)).toEqual(['001186'])
  })

  it('persists transactions and clears the ledger when the fund is removed', async () => {
    const store = useStockStore()
    store.fundWatchList = ['001186']
    store.fundPositions = { '001186': { holdingAmount: 1000, profit: 0 } }
    store.ensureFundLedger('001186', '2026-07-21', 2)
    store.applyFundTransaction('001186', {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })
    await nextTick()

    expect(JSON.parse(localStorage.getItem('fundLedgers') ?? '{}')['001186'].transactions).toHaveLength(1)

    await store.removeFund('001186')
    expect(store.fundLedgers['001186']).toBeUndefined()
  })

  it('replays edited transactions and rebuilds snapshots from official NAV history', () => {
    const store = useStockStore()
    store.fundPositions = { '001186': { holdingAmount: 1000, profit: 0 } }
    store.ensureFundLedger('001186', '2026-07-21', 2)
    store.applyFundTransaction('001186', {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 100,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })

    store.editFundTransaction('001186', 'buy-1', {
      id: 'buy-1',
      type: 'buy',
      tradeDate: '2026-07-22',
      nav: 2,
      amount: 200,
      feeRate: 0,
      createdAt: '2026-07-22T10:00:00.000Z'
    })
    store.rebuildFundLedgerSnapshots('001186', [
      { date: '2026-07-21', nav: 2 },
      { date: '2026-07-22', nav: 2.1 }
    ])

    expect(store.fundLedgers['001186'].transactions[0]).toMatchObject({ amount: 200, shares: 100 })
    const snapshots = store.fundLedgers['001186'].snapshots
    expect(snapshots[snapshots.length - 1]).toMatchObject({ date: '2026-07-22', totalProfit: 60 })

    store.deleteFundTransaction('001186', 'buy-1')
    expect(store.fundLedgers['001186'].transactions).toEqual([])
  })
})
