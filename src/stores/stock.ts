import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { fetchMinuteData, fetchStocks, type Stock } from '../api/stock'

const WATCHLIST_STORAGE_KEY = 'watchList'

export interface SparklineData {
  code: string
  prices: number[]
}

export const useStockStore = defineStore('stock', () => {
  const watchList = ref<string[]>([])
  const stocks = ref<Map<string, Stock>>(new Map())
  const sparklines = ref<Map<string, number[]>>(new Map())
  const loading = ref(false)
  const lastUpdate = ref<Date | null>(null)

  let refreshTimer: number | null = null

  watch(watchList, (nextWatchList) => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(nextWatchList))
  }, { deep: true })

  async function init() {
    const saved = localStorage.getItem(WATCHLIST_STORAGE_KEY)
    if (saved) {
      watchList.value = JSON.parse(saved)
      await refreshAll()
    }

    startAutoRefresh()
  }

  async function refreshStocks() {
    if (watchList.value.length === 0 || loading.value) {
      return
    }

    loading.value = true
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
      loading.value = false
    }
  }

  async function refreshAll() {
    if (watchList.value.length === 0) {
      stocks.value = new Map()
      sparklines.value = new Map()
      lastUpdate.value = new Date()
      return
    }

    await Promise.all([
      refreshStocks(),
      fetchAllSparklines()
    ])
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

  async function removeStock(code: string) {
    const index = watchList.value.indexOf(code)
    if (index === -1) {
      return
    }

    watchList.value.splice(index, 1)
    stocks.value.delete(code)

    const nextSparklines = new Map(sparklines.value)
    nextSparklines.delete(code)
    sparklines.value = nextSparklines
  }

  function normalizeTargetIndex(targetIndex: number, listLength: number) {
    return Math.max(0, Math.min(targetIndex, Math.max(listLength - 1, 0)))
  }

  function moveStock(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
      return
    }

    const list = [...watchList.value]
    const [code] = list.splice(fromIndex, 1)
    if (!code) {
      return
    }

    list.splice(normalizeTargetIndex(toIndex, list.length + 1), 0, code)
    watchList.value = list
  }

  function moveStockByCode(code: string, targetIndex: number) {
    const fromIndex = watchList.value.indexOf(code)
    if (fromIndex === -1) {
      return
    }

    moveStock(fromIndex, normalizeTargetIndex(targetIndex, watchList.value.length))
  }

  function moveStockToTop(code: string) {
    moveStockByCode(code, 0)
  }

  function moveStockToBottom(code: string) {
    moveStockByCode(code, watchList.value.length - 1)
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
  const stockList = computed(() =>
    watchList.value
      .map((code) => stocks.value.get(code))
      .filter((stock): stock is Stock => Boolean(stock))
  )

  return {
    watchList,
    stocks,
    sparklines,
    loading,
    lastUpdate,
    stockList,
    init,
    refreshStocks,
    refreshAll,
    addStock,
    removeStock,
    getStock,
    getSparkline,
    moveStock,
    moveStockByCode,
    moveStockToTop,
    moveStockToBottom,
    fetchSparkline,
    fetchAllSparklines,
    startAutoRefresh,
    stopAutoRefresh
  }
})
