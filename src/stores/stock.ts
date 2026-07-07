import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  fetchFunds,
  fetchMinuteData,
  fetchStocks,
  type AssetType,
  type FundQuote,
  type Stock
} from '../api/stock'
import { moveItem } from '../utils/list'

const WATCHLIST_STORAGE_KEY = 'watchList'
const FUND_WATCHLIST_STORAGE_KEY = 'fundWatchList'
const ACTIVE_ASSET_TYPE_STORAGE_KEY = 'activeAssetType'

export interface SparklineData {
  code: string
  prices: number[]
}

function readStoredList(key: string): string[] {
  const saved = localStorage.getItem(key)
  if (!saved) {
    return []
  }

  try {
    const parsed = JSON.parse(saved)
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
      : []
  } catch (error) {
    console.error(`Load ${key} error:`, error)
    return []
  }
}

function readStoredAssetType(): AssetType {
  const saved = localStorage.getItem(ACTIVE_ASSET_TYPE_STORAGE_KEY)
  return saved === 'fund' ? 'fund' : 'stock'
}

export const useStockStore = defineStore('stock', () => {
  const activeAssetType = ref<AssetType>('stock')
  const watchList = ref<string[]>([])
  const fundWatchList = ref<string[]>([])
  const stocks = ref<Map<string, Stock>>(new Map())
  const funds = ref<Map<string, FundQuote>>(new Map())
  const sparklines = ref<Map<string, number[]>>(new Map())
  const stockLoading = ref(false)
  const fundLoading = ref(false)
  const lastUpdate = ref<Date | null>(null)

  let refreshTimer: number | null = null

  const loading = computed(() => stockLoading.value || fundLoading.value)

  watch(watchList, (nextWatchList) => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(nextWatchList))
  }, { deep: true })

  watch(fundWatchList, (nextWatchList) => {
    localStorage.setItem(FUND_WATCHLIST_STORAGE_KEY, JSON.stringify(nextWatchList))
  }, { deep: true })

  watch(activeAssetType, (nextAssetType) => {
    localStorage.setItem(ACTIVE_ASSET_TYPE_STORAGE_KEY, nextAssetType)
  })

  async function init() {
    watchList.value = readStoredList(WATCHLIST_STORAGE_KEY)
    fundWatchList.value = readStoredList(FUND_WATCHLIST_STORAGE_KEY)
    activeAssetType.value = readStoredAssetType()

    await refreshAll()
    startAutoRefresh()
  }

  async function refreshStocks() {
    if (watchList.value.length === 0) {
      stocks.value = new Map()
      sparklines.value = new Map()
      return
    }

    if (stockLoading.value) {
      return
    }

    stockLoading.value = true
    try {
      const data = await fetchStocks(watchList.value)
      const nextStocks = new Map<string, Stock>()
      data.forEach((stock) => {
        nextStocks.set(stock.code, stock)
      })
      stocks.value = nextStocks
      lastUpdate.value = new Date()
    } catch (error) {
      console.error('Refresh stocks error:', error)
    } finally {
      stockLoading.value = false
    }
  }

  async function refreshFunds() {
    if (fundWatchList.value.length === 0) {
      funds.value = new Map()
      return
    }

    if (fundLoading.value) {
      return
    }

    fundLoading.value = true
    try {
      const data = await fetchFunds(fundWatchList.value)
      const currentCodes = new Set(fundWatchList.value)
      const nextFunds = new Map(
        [...funds.value.entries()].filter(([code]) => currentCodes.has(code))
      )

      data.forEach((fund) => {
        nextFunds.set(fund.code, fund)
      })

      funds.value = nextFunds
      lastUpdate.value = new Date()
    } catch (error) {
      console.error('Refresh funds error:', error)
    } finally {
      fundLoading.value = false
    }
  }

  async function refreshAll() {
    const tasks: Promise<void>[] = []

    if (watchList.value.length > 0) {
      tasks.push(refreshStocks(), fetchAllSparklines())
    } else {
      stocks.value = new Map()
      sparklines.value = new Map()
    }

    if (fundWatchList.value.length > 0) {
      tasks.push(refreshFunds())
    } else {
      funds.value = new Map()
    }

    if (tasks.length === 0) {
      lastUpdate.value = new Date()
      return
    }

    await Promise.all(tasks)
  }

  function startAutoRefresh() {
    stopAutoRefresh()
    refreshTimer = window.setInterval(() => {
      void refreshAll()
    }, 30000)
  }

  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  function setActiveAssetType(assetType: AssetType) {
    activeAssetType.value = assetType
  }

  async function addStock(code: string) {
    if (watchList.value.includes(code)) {
      return
    }

    const data = await fetchStocks([code])
    if (data.length === 0) {
      console.warn('fetchStocks returned empty for', code)
      return
    }

    watchList.value = [...watchList.value, code]
    const nextMap = new Map(stocks.value)
    nextMap.set(data[0].code, data[0])
    stocks.value = nextMap

    void fetchSparkline(code)
  }

  async function addFund(code: string) {
    if (fundWatchList.value.includes(code)) {
      return
    }

    const data = await fetchFunds([code])
    if (data.length === 0) {
      console.warn('fetchFunds returned empty for', code)
      return
    }

    const fund = data[0]
    fundWatchList.value = [...fundWatchList.value, fund.code]
    const nextMap = new Map(funds.value)
    nextMap.set(fund.code, fund)
    funds.value = nextMap
  }

  async function removeStock(code: string) {
    const index = watchList.value.indexOf(code)
    if (index === -1) {
      return
    }

    watchList.value.splice(index, 1)
    const nextStocks = new Map(stocks.value)
    nextStocks.delete(code)
    stocks.value = nextStocks

    const nextSparklines = new Map(sparklines.value)
    nextSparklines.delete(code)
    sparklines.value = nextSparklines
  }

  async function removeFund(code: string) {
    const index = fundWatchList.value.indexOf(code)
    if (index === -1) {
      return
    }

    fundWatchList.value.splice(index, 1)
    const nextFunds = new Map(funds.value)
    nextFunds.delete(code)
    funds.value = nextFunds
  }

  function normalizeTargetIndex(targetIndex: number, listLength: number) {
    return Math.max(0, Math.min(targetIndex, Math.max(listLength - 1, 0)))
  }

  function moveStock(fromIndex: number, toIndex: number) {
    watchList.value = moveItem(watchList.value, fromIndex, toIndex)
  }

  function moveFund(fromIndex: number, toIndex: number) {
    fundWatchList.value = moveItem(fundWatchList.value, fromIndex, toIndex)
  }

  function moveStockByCode(code: string, targetIndex: number) {
    const fromIndex = watchList.value.indexOf(code)
    if (fromIndex === -1) {
      return
    }

    moveStock(fromIndex, normalizeTargetIndex(targetIndex, watchList.value.length))
  }

  function moveFundByCode(code: string, targetIndex: number) {
    const fromIndex = fundWatchList.value.indexOf(code)
    if (fromIndex === -1) {
      return
    }

    moveFund(fromIndex, normalizeTargetIndex(targetIndex, fundWatchList.value.length))
  }

  function moveStockToTop(code: string) {
    moveStockByCode(code, 0)
  }

  function moveStockToBottom(code: string) {
    moveStockByCode(code, watchList.value.length - 1)
  }

  function moveFundToTop(code: string) {
    moveFundByCode(code, 0)
  }

  function moveFundToBottom(code: string) {
    moveFundByCode(code, fundWatchList.value.length - 1)
  }

  async function fetchSparkline(code: string) {
    const minuteData = await fetchMinuteData(code)
    if (minuteData.length === 0) {
      return
    }

    const prices = minuteData.map((item) => item.price)
    const nextSparklines = new Map(sparklines.value)
    nextSparklines.set(code, prices)
    sparklines.value = nextSparklines
  }

  async function fetchAllSparklines() {
    await Promise.all(watchList.value.map((code) => fetchSparkline(code)))
  }

  const getSparkline = computed(() => (code: string) => sparklines.value.get(code))
  const getStock = computed(() => (code: string) => stocks.value.get(code))
  const getFund = computed(() => (code: string) => funds.value.get(code))
  const stockList = computed(() =>
    watchList.value
      .map((code) => stocks.value.get(code))
      .filter((stock): stock is Stock => Boolean(stock))
  )
  const fundList = computed(() =>
    fundWatchList.value
      .map((code) => funds.value.get(code))
      .filter((fund): fund is FundQuote => Boolean(fund))
  )

  return {
    activeAssetType,
    watchList,
    fundWatchList,
    stocks,
    funds,
    sparklines,
    loading,
    stockLoading,
    fundLoading,
    lastUpdate,
    stockList,
    fundList,
    init,
    refreshStocks,
    refreshFunds,
    refreshAll,
    setActiveAssetType,
    addStock,
    addFund,
    removeStock,
    removeFund,
    getStock,
    getFund,
    getSparkline,
    moveStock,
    moveFund,
    moveStockByCode,
    moveFundByCode,
    moveStockToTop,
    moveStockToBottom,
    moveFundToTop,
    moveFundToBottom,
    fetchSparkline,
    fetchAllSparklines,
    startAutoRefresh,
    stopAutoRefresh
  }
})
