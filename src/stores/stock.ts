import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  fetchFunds,
  fetchMinuteData,
  fetchStocks,
  searchFunds,
  type AssetType,
  type FundQuote,
  type Stock
} from '../api/stock'
import { applyFundDisplayName, findExactFundSearchResult } from '../utils/funds'
import {
  addFundTransaction,
  createEmptyFundLedger,
  createLedgerFromLegacyPosition,
  rebuildFundSnapshots,
  removeFundTransaction,
  replaceFundTransaction,
  type FundLedger,
  type FundNavPointLike,
  type FundTransactionInput
} from '../utils/fundLedger'
import { moveItem } from '../utils/list'
import type { FundPosition, StockPosition } from '../utils/positions'

const WATCHLIST_STORAGE_KEY = 'watchList'
const FUND_WATCHLIST_STORAGE_KEY = 'fundWatchList'
const FUND_NAMES_STORAGE_KEY = 'fundNames'
const STOCK_POSITIONS_STORAGE_KEY = 'stockPositions'
const FUND_POSITIONS_STORAGE_KEY = 'fundPositions'
const FUND_LEDGERS_STORAGE_KEY = 'fundLedgers'
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

function readStoredRecord(key: string): Record<string, string> {
  const saved = localStorage.getItem(key)
  if (!saved) {
    return {}
  }

  try {
    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string')
    )
  } catch (error) {
    console.error(`Load ${key} error:`, error)
    return {}
  }
}

function readStoredNumberRecord<T>(key: string, isValid: (value: unknown) => value is T): Record<string, T> {
  const saved = localStorage.getItem(key)
  if (!saved) {
    return {}
  }

  try {
    const parsed = JSON.parse(saved)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }

    return Object.fromEntries(
      Object.entries(parsed)
        .filter((entry): entry is [string, T] => typeof entry[0] === 'string' && isValid(entry[1]))
    )
  } catch (error) {
    console.error(`Load ${key} error:`, error)
    return {}
  }
}

function isStockPosition(value: unknown): value is StockPosition {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Number.isFinite((value as StockPosition).costPrice)
    && Number.isFinite((value as StockPosition).shares)
  )
}

function isFundPosition(value: unknown): value is FundPosition {
  return Boolean(
    value
    && typeof value === 'object'
    && !Array.isArray(value)
    && Number.isFinite((value as FundPosition).holdingAmount)
    && Number.isFinite((value as FundPosition).profit)
  )
}

function isFundLedger(value: unknown): value is FundLedger {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const ledger = value as FundLedger
  const baseline = ledger.baseline
  return ledger.schemaVersion === 1
    && typeof ledger.code === 'string'
    && Boolean(baseline && typeof baseline === 'object')
    && typeof baseline.date === 'string'
    && Number.isFinite(baseline.nav)
    && Number.isFinite(baseline.holdingAmount)
    && Number.isFinite(baseline.holdingProfit)
    && Number.isFinite(baseline.shares)
    && Number.isFinite(baseline.costAmount)
    && Array.isArray(ledger.transactions)
    && Array.isArray(ledger.snapshots)
}

function getRefreshErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) {
    return `${fallback}：${error.message}`
  }

  if (typeof error === 'string' && error.trim()) {
    return `${fallback}：${error}`
  }

  return fallback
}

export const useStockStore = defineStore('stock', () => {
  const activeAssetType = ref<AssetType>('stock')
  const watchList = ref<string[]>([])
  const fundWatchList = ref<string[]>([])
  const fundNames = ref<Record<string, string>>({})
  const stockPositions = ref<Record<string, StockPosition>>({})
  const fundPositions = ref<Record<string, FundPosition>>({})
  const fundLedgers = ref<Record<string, FundLedger>>({})
  const stocks = ref<Map<string, Stock>>(new Map())
  const funds = ref<Map<string, FundQuote>>(new Map())
  const sparklines = ref<Map<string, number[]>>(new Map())
  const stockLoading = ref(false)
  const fundLoading = ref(false)
  const stockLastUpdate = ref<Date | null>(null)
  const fundLastUpdate = ref<Date | null>(null)
  const stockRefreshError = ref('')
  const fundRefreshError = ref('')

  let refreshTimer: number | null = null

  const loading = computed(() => stockLoading.value || fundLoading.value)
  const lastUpdate = computed(() => (
    activeAssetType.value === 'stock' ? stockLastUpdate.value : fundLastUpdate.value
  ))
  const activeRefreshError = computed(() => (
    activeAssetType.value === 'stock' ? stockRefreshError.value : fundRefreshError.value
  ))
  const activeDataStale = computed(() => Boolean(
    activeRefreshError.value
    && (activeAssetType.value === 'stock' ? stocks.value.size : funds.value.size)
  ))

  watch(watchList, (nextWatchList) => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(nextWatchList))
  }, { deep: true })

  watch(fundWatchList, (nextWatchList) => {
    localStorage.setItem(FUND_WATCHLIST_STORAGE_KEY, JSON.stringify(nextWatchList))
  }, { deep: true })

  watch(fundNames, (nextNames) => {
    localStorage.setItem(FUND_NAMES_STORAGE_KEY, JSON.stringify(nextNames))
  }, { deep: true })

  watch(stockPositions, (nextPositions) => {
    localStorage.setItem(STOCK_POSITIONS_STORAGE_KEY, JSON.stringify(nextPositions))
  }, { deep: true })

  watch(fundPositions, (nextPositions) => {
    localStorage.setItem(FUND_POSITIONS_STORAGE_KEY, JSON.stringify(nextPositions))
  }, { deep: true })

  watch(fundLedgers, (nextLedgers) => {
    localStorage.setItem(FUND_LEDGERS_STORAGE_KEY, JSON.stringify(nextLedgers))
  }, { deep: true })

  watch(activeAssetType, (nextAssetType) => {
    localStorage.setItem(ACTIVE_ASSET_TYPE_STORAGE_KEY, nextAssetType)
  })

  function loadStoredState() {
    watchList.value = readStoredList(WATCHLIST_STORAGE_KEY)
    fundWatchList.value = readStoredList(FUND_WATCHLIST_STORAGE_KEY)
    fundNames.value = readStoredRecord(FUND_NAMES_STORAGE_KEY)
    stockPositions.value = readStoredNumberRecord(STOCK_POSITIONS_STORAGE_KEY, isStockPosition)
    fundPositions.value = readStoredNumberRecord(FUND_POSITIONS_STORAGE_KEY, isFundPosition)
    fundLedgers.value = readStoredNumberRecord(FUND_LEDGERS_STORAGE_KEY, isFundLedger)
    activeAssetType.value = readStoredAssetType()
  }

  async function init() {
    loadStoredState()

    await refreshAll()
    startAutoRefresh()
  }

  async function refreshStocks() {
    if (watchList.value.length === 0) {
      stocks.value = new Map()
      sparklines.value = new Map()
      stockRefreshError.value = ''
      stockLastUpdate.value = null
      return
    }

    if (stockLoading.value) {
      return
    }

    stockLoading.value = true
    try {
      const data = await fetchStocks(watchList.value)
      const currentCodes = new Set(watchList.value)
      const nextStocks = new Map(
        [...stocks.value.entries()].filter(([code]) => currentCodes.has(code))
      )
      data.forEach((stock) => {
        nextStocks.set(stock.code, stock)
      })
      stocks.value = nextStocks
      if (data.length > 0) {
        stockLastUpdate.value = new Date()
        stockRefreshError.value = ''
      } else {
        stockRefreshError.value = '行情服务暂未返回股票数据，已保留上次结果'
      }
    } catch (error) {
      stockRefreshError.value = getRefreshErrorMessage(error, '股票行情刷新失败')
      console.error('Refresh stocks error:', error)
    } finally {
      stockLoading.value = false
    }
  }

  async function refreshFunds() {
    if (fundWatchList.value.length === 0) {
      funds.value = new Map()
      fundRefreshError.value = ''
      fundLastUpdate.value = null
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
        const cachedName = fundNames.value[fund.code]
        const cachedFund = cachedName ? { ...fund, name: cachedName } : undefined
        const resolvedFund = applyFundDisplayName(fund, undefined, nextFunds.get(fund.code) ?? cachedFund)
        nextFunds.set(fund.code, resolvedFund)

        const nav = typeof resolvedFund.nav === 'number' && resolvedFund.nav > 0
          ? resolvedFund.nav
          : resolvedFund.estimateNav
        if (fundPositions.value[fund.code] && typeof nav === 'number' && Number.isFinite(nav) && nav > 0) {
          ensureFundLedger(fund.code, resolvedFund.navDate || resolvedFund.estimateTime.slice(0, 10), nav)
        }
      })

      funds.value = nextFunds
      if (data.length > 0) {
        fundLastUpdate.value = new Date()
        fundRefreshError.value = ''
      } else {
        fundRefreshError.value = '行情服务暂未返回基金数据，已保留上次结果'
      }
    } catch (error) {
      fundRefreshError.value = getRefreshErrorMessage(error, '基金行情刷新失败')
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
    const normalizedCode = code.trim()
    if (fundWatchList.value.includes(normalizedCode)) {
      return
    }

    const matchedFund = findExactFundSearchResult(await searchFunds(normalizedCode), normalizedCode)
    if (!matchedFund) {
      console.warn('searchFunds did not return a supported OTC fund for', normalizedCode)
      return
    }

    const data = await fetchFunds([matchedFund.code])
    if (data.length === 0) {
      console.warn('fetchFunds returned empty for', matchedFund.code)
      return
    }

    const fund = applyFundDisplayName(data[0], matchedFund)
    fundNames.value = {
      ...fundNames.value,
      [fund.code]: fund.name
    }
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
    const nextStockPositions = { ...stockPositions.value }
    delete nextStockPositions[code]
    stockPositions.value = nextStockPositions
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
    const nextFundNames = { ...fundNames.value }
    delete nextFundNames[code]
    fundNames.value = nextFundNames
    const nextFundPositions = { ...fundPositions.value }
    delete nextFundPositions[code]
    fundPositions.value = nextFundPositions
    clearFundLedger(code)
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

  function setStockPosition(code: string, position: StockPosition) {
    stockPositions.value = {
      ...stockPositions.value,
      [code]: position
    }
  }

  function clearStockPosition(code: string) {
    const nextPositions = { ...stockPositions.value }
    delete nextPositions[code]
    stockPositions.value = nextPositions
  }

  function setFundPosition(code: string, position: FundPosition) {
    const quote = funds.value.get(code)
    const nav = quote && typeof quote.nav === 'number' && quote.nav > 0
      ? quote.nav
      : quote?.estimateNav

    if (quote && nav && Number.isFinite(nav) && nav > 0) {
      fundLedgers.value = {
        ...fundLedgers.value,
        [code]: createLedgerFromLegacyPosition(
          code,
          position,
          quote.navDate || quote.estimateTime.slice(0, 10),
          nav
        )
      }
      removeLegacyFundPosition(code)
      return
    }

    fundPositions.value = { ...fundPositions.value, [code]: position }
  }

  function clearFundPosition(code: string) {
    removeLegacyFundPosition(code)
    clearFundLedger(code)
  }

  function ensureFundLedger(code: string, date: string, nav: number, allowEmpty = false): FundLedger | null {
    const existing = fundLedgers.value[code]
    if (existing) {
      return existing
    }

    const legacyPosition = fundPositions.value[code]
    if (!legacyPosition && !allowEmpty) return null

    const ledger = legacyPosition
      ? createLedgerFromLegacyPosition(code, legacyPosition, date, nav)
      : createEmptyFundLedger(code, date, nav)
    fundLedgers.value = {
      ...fundLedgers.value,
      [code]: ledger
    }
    if (legacyPosition) {
      removeLegacyFundPosition(code)
    }
    return ledger
  }

  function removeLegacyFundPosition(code: string) {
    if (!fundPositions.value[code]) return

    const nextPositions = { ...fundPositions.value }
    delete nextPositions[code]
    fundPositions.value = nextPositions
  }

  function applyFundTransaction(code: string, input: FundTransactionInput) {
    const ledger = fundLedgers.value[code]
    if (!ledger) {
      throw new Error('请先建立基金持仓账本')
    }

    const nextLedger = addFundTransaction(ledger, input)
    fundLedgers.value = {
      ...fundLedgers.value,
      [code]: rebuildFundSnapshots(
        nextLedger,
        ledger.snapshots.map((snapshot) => ({ date: snapshot.date, nav: snapshot.officialNav }))
      )
    }
  }

  function editFundTransaction(code: string, id: string, input: FundTransactionInput) {
    const ledger = fundLedgers.value[code]
    if (!ledger) {
      throw new Error('请先建立基金持仓账本')
    }

    const nextLedger = replaceFundTransaction(ledger, id, input)
    fundLedgers.value = {
      ...fundLedgers.value,
      [code]: rebuildFundSnapshots(
        nextLedger,
        ledger.snapshots.map((snapshot) => ({ date: snapshot.date, nav: snapshot.officialNav }))
      )
    }
  }

  function deleteFundTransaction(code: string, id: string) {
    const ledger = fundLedgers.value[code]
    if (!ledger) {
      throw new Error('请先建立基金持仓账本')
    }

    const nextLedger = removeFundTransaction(ledger, id)
    fundLedgers.value = {
      ...fundLedgers.value,
      [code]: rebuildFundSnapshots(
        nextLedger,
        ledger.snapshots.map((snapshot) => ({ date: snapshot.date, nav: snapshot.officialNav }))
      )
    }
  }

  function rebuildFundLedgerSnapshots(code: string, history: readonly FundNavPointLike[]) {
    const ledger = fundLedgers.value[code]
    if (!ledger) {
      return
    }

    fundLedgers.value = {
      ...fundLedgers.value,
      [code]: rebuildFundSnapshots(ledger, history)
    }
  }

  function clearFundLedger(code: string) {
    const nextLedgers = { ...fundLedgers.value }
    delete nextLedgers[code]
    fundLedgers.value = nextLedgers
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
    fundNames,
    stockPositions,
    fundPositions,
    fundLedgers,
    stocks,
    funds,
    sparklines,
    loading,
    stockLoading,
    fundLoading,
    lastUpdate,
    stockLastUpdate,
    fundLastUpdate,
    stockRefreshError,
    fundRefreshError,
    activeRefreshError,
    activeDataStale,
    stockList,
    fundList,
    init,
    loadStoredState,
    refreshStocks,
    refreshFunds,
    refreshAll,
    setActiveAssetType,
    addStock,
    addFund,
    removeStock,
    removeFund,
    setStockPosition,
    clearStockPosition,
    setFundPosition,
    clearFundPosition,
    ensureFundLedger,
    applyFundTransaction,
    editFundTransaction,
    deleteFundTransaction,
    rebuildFundLedgerSnapshots,
    clearFundLedger,
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
