import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchStocks, type Stock } from '../api/stock'
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
})
