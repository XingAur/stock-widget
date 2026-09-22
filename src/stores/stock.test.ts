// @vitest-environment happy-dom
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFunds, fetchMinuteData, fetchStocks, type FundQuote, type Stock } from '../api/stock'
import { PERSIST_SHADOW_KEY, flushPersistedState, resetPersistenceForTests } from '../utils/persistence'
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
    resetPersistenceForTests()
    vi.clearAllMocks()
  })

  it('skips auto refresh ticks while the document is hidden', async () => {
    vi.useFakeTimers()
    const store = useStockStore()
    store.watchList = ['000001']
    vi.mocked(fetchStocks).mockResolvedValue([createStock()])
    vi.mocked(fetchMinuteData).mockResolvedValue([])
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden'
    })

    try {
      store.startAutoRefresh()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchStocks).not.toHaveBeenCalled()
    } finally {
      store.stopAutoRefresh()
      vi.useRealTimers()
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        value: 'visible'
      })
    }
  })

  it('refreshes on an auto refresh tick while the document is visible', async () => {
    vi.useFakeTimers()
    const store = useStockStore()
    store.watchList = ['000001']
    vi.mocked(fetchStocks).mockResolvedValue([createStock()])
    vi.mocked(fetchMinuteData).mockResolvedValue([])
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible'
    })

    try {
      store.startAutoRefresh()
      await vi.advanceTimersByTimeAsync(30_000)
      expect(fetchStocks).toHaveBeenCalled()
    } finally {
      store.stopAutoRefresh()
      vi.useRealTimers()
    }
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
    expect(store.stockRefreshError).toBeTruthy()
    expect(store.stockLastUpdate).toBeNull()
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
    expect(store.fundRefreshError).toBeTruthy()
    expect(store.fundLastUpdate).toBeNull()
  })

  it('keeps the last successful fund update time when a refresh fails', async () => {
    const existingFund = createFundQuote()
    const store = useStockStore()
    store.fundWatchList = [existingFund.code]
    store.funds = new Map([[existingFund.code, existingFund]])
    vi.mocked(fetchFunds)
      .mockResolvedValueOnce([existingFund])
      .mockRejectedValueOnce(new Error('network unavailable'))

    await store.refreshFunds()
    const successfulUpdate = store.fundLastUpdate
    await store.refreshFunds()

    expect(store.funds.get(existingFund.code)).toEqual(existingFund)
    expect(store.fundLastUpdate).toEqual(successfulUpdate)
    expect(store.fundRefreshError).toContain('network unavailable')
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
    resetPersistenceForTests()
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
    expect(store.fundPositions['001186']).toBeUndefined()
  })

  it('stores a manually entered holding in the ledger when a NAV is available', () => {
    const fund = createFundQuote({ nav: 2, navDate: '2026-07-21' })
    const store = useStockStore()
    store.funds = new Map([[fund.code, fund]])

    store.setFundPosition(fund.code, { holdingAmount: 1000, profit: 100 })

    expect(store.fundLedgers[fund.code]?.baseline).toMatchObject({
      date: '2026-07-21',
      nav: 2,
      holdingAmount: 1000,
      shares: 500,
      costAmount: 900
    })
    expect(store.fundPositions[fund.code]).toBeUndefined()
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
    await flushPersistedState()

    const persisted = JSON.parse(localStorage.getItem(PERSIST_SHADOW_KEY) ?? '{}')
    expect(persisted.fundLedgers['001186'].transactions).toHaveLength(1)

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

describe('state persistence across restarts', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorage(),
      configurable: true
    })
    resetPersistenceForTests()
    vi.clearAllMocks()
  })

  async function readShadow(): Promise<Record<string, unknown>> {
    await nextTick()
    await flushPersistedState()
    return JSON.parse(localStorage.getItem(PERSIST_SHADOW_KEY) ?? '{}')
  }

  it('keeps a removed stock out of the persisted watch list', async () => {
    const store = useStockStore()
    store.watchList = ['000001', '600000']
    await nextTick()

    await store.removeStock('600000')
    const persisted = await readShadow()

    expect(persisted.watchList).toEqual(['000001'])
    expect(persisted.stockPositions).not.toHaveProperty('600000')
  })

  it('keeps a cleared position out of the persisted state', async () => {
    const store = useStockStore()
    store.watchList = ['000001']
    store.stockPositions = { '000001': { costPrice: 10, shares: 100 } }
    await nextTick()

    store.clearStockPosition('000001')
    const persisted = await readShadow()

    expect(persisted.stockPositions).toEqual({})
  })

  it('restores state from the persisted payload on restart', async () => {
    const fund = createFundQuote()
    vi.mocked(fetchFunds).mockResolvedValueOnce([fund])

    const first = useStockStore()
    first.watchList = ['000001']
    first.stockPositions = { '000001': { costPrice: 12, shares: 200 } }
    first.fundWatchList = [fund.code]
    first.activeAssetType = 'fund'
    await nextTick()
    await readShadow()

    // 模拟进程重启：全新 store + 全新 persistence 读取缓存
    resetPersistenceForTests()
    setActivePinia(createPinia())
    const second = useStockStore()
    await second.restorePersistedState()

    expect(second.watchList).toEqual(['000001'])
    expect(second.stockPositions).toEqual({ '000001': { costPrice: 12, shares: 200 } })
    expect(second.fundWatchList).toEqual([fund.code])
    expect(second.activeAssetType).toBe('fund')
  })

  it('migrates legacy localStorage keys into the persisted payload', async () => {
    localStorage.setItem('watchList', JSON.stringify(['600000']))
    localStorage.setItem('activeAssetType', 'fund')

    const store = useStockStore()
    store.loadStoredState()
    await readShadow()

    const persisted = JSON.parse(localStorage.getItem(PERSIST_SHADOW_KEY) ?? '{}')
    expect(persisted.watchList).toEqual(['600000'])
    expect(persisted.activeAssetType).toBe('fund')
  })

  it('reports add failures so the UI can warn the user', async () => {
    vi.mocked(fetchStocks).mockResolvedValueOnce([])
    const store = useStockStore()
    const succeeded = await store.addStock('999999')

    expect(succeeded).toBe(false)
    expect(store.watchList).toEqual([])
  })
})
