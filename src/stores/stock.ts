import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { fetchStocks, type Stock, fetchMinuteData } from '../api/stock'

// 分时价格数据（用于sparkline）
export interface SparklineData {
  code: string
  prices: number[]
}

export const useStockStore = defineStore('stock', () => {
  // 自选股列表
  const watchList = ref<string[]>([])
  // 股票数据
  const stocks = ref<Map<string, Stock>>(new Map())
  // sparkline数据
  const sparklines = ref<Map<string, number[]>>(new Map())
  // 当前选中的股票代码
  const currentStock = ref<string | null>(null)
  // 是否正在加载
  const loading = ref(false)
  // 最后更新时间
  const lastUpdate = ref<Date | null>(null)
  // 刷新定时器
  let refreshTimer: number | null = null

  // 初始化 - 从本地存储加载
  async function init() {
    const saved = localStorage.getItem('watchList')
    if (saved) {
      watchList.value = JSON.parse(saved)
      await refreshStocks()
    }
    startAutoRefresh()
  }

  // 保存到本地存储
  function saveWatchList() {
    localStorage.setItem('watchList', JSON.stringify(watchList.value))
  }

  // 刷新股票数据
  async function refreshStocks() {
    if (watchList.value.length === 0) return
    if (loading.value) return

    loading.value = true
    try {
      const data = await fetchStocks(watchList.value)
      const newMap = new Map<string, Stock>()
      data.forEach(stock => {
        newMap.set(stock.code, stock)
      })
      stocks.value = newMap
      lastUpdate.value = new Date()
    } catch (e) {
      console.error('Refresh stocks error:', e)
    } finally {
      loading.value = false
    }
  }

  // 开始自动刷新（30秒）
  function startAutoRefresh() {
    stopAutoRefresh()
    refreshTimer = window.setInterval(() => {
      refreshStocks()
    }, 30000)
  }

  // 停止自动刷新
  function stopAutoRefresh() {
    if (refreshTimer) {
      clearInterval(refreshTimer)
      refreshTimer = null
    }
  }

  // 添加股票
  async function addStock(code: string) {
    if (!watchList.value.includes(code)) {
      watchList.value.push(code)
      saveWatchList()
      await refreshStocks()
      await fetchSparkline(code)
    }
  }

  // 删除股票
  async function removeStock(code: string) {
    const index = watchList.value.indexOf(code)
    if (index > -1) {
      watchList.value.splice(index, 1)
      stocks.value.delete(code)
      saveWatchList()
    }
  }

  // 设置当前股票
  function setCurrentStock(code: string | null) {
    currentStock.value = code
  }

  // 移动股票位置
  function moveStock(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return
    const list = [...watchList.value]
    const code = list.splice(fromIndex, 1)[0]
    list.splice(toIndex, 0, code)
    watchList.value = list
    saveWatchList()
  }

  // 获取sparkline数据
  async function fetchSparkline(code: string) {
    const minuteData = await fetchMinuteData(code)
    if (minuteData.length > 0) {
      const prices = minuteData.map(m => m.price)
      const newMap = new Map(sparklines.value)
      newMap.set(code, prices)
      sparklines.value = newMap
    }
  }

  // 获取所有自选股的sparkline
  async function fetchAllSparklines() {
    const promises = watchList.value.map(code => fetchSparkline(code))
    await Promise.all(promises)
  }

  // 获取单个sparkline
  const getSparkline = computed(() => (code: string) => sparklines.value.get(code))

  // 获取股票数据
  const getStock = computed(() => (code: string) => stocks.value.get(code))

  // 股票列表（保持顺序）
  const stockList = computed(() => {
    return watchList.value
      .map(code => stocks.value.get(code))
      .filter((s): s is Stock => !!s)
  })

  return {
    watchList,
    stocks,
    sparklines,
    currentStock,
    loading,
    lastUpdate,
    stockList,
    init,
    refreshStocks,
    addStock,
    removeStock,
    setCurrentStock,
    getStock,
    getSparkline,
    moveStock,
    fetchSparkline,
    fetchAllSparklines,
    startAutoRefresh,
    stopAutoRefresh
  }
})