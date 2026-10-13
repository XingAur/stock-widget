<template>
  <div class="home-view" @click="closeContextMenu">
    <div v-if="false" class="asset-tabs" @click.stop>
      <button
        class="asset-tab"
        :class="{ active: stockStore.activeAssetType === 'stock' }"
        type="button"
        @click="switchAssetType('stock')"
      >
        股票
      </button>
      <button
        class="asset-tab"
        :class="{ active: stockStore.activeAssetType === 'fund' }"
        type="button"
        @click="switchAssetType('fund')"
      >
        基金
      </button>
    </div>

    <div ref="listRef" class="stock-list" @scroll="closeContextMenu">
      <div v-if="activeListLength === 0" class="empty-state">
        <p>{{ emptyTitle }}</p>
        <span>{{ emptyHint }}</span>
      </div>

      <WatchlistAccountSummary v-if="showAccountSummary" :cards="accountSummaryCards" />

      <template v-if="stockStore.activeAssetType === 'stock'">
        <WatchlistStockCard
          v-for="(stock, index) in stockStore.stockList"
          :key="stock.code"
          :stock="stock"
          :index="index"
          :selected="isStockCardSelected(stock.code)"
          :dragging="isDragging('stock', stock.code)"
          :drag-over="isDragOver('stock', index)"
          :show-sparkline="settingsStore.settings.showSparklines"
          :prices="stockStore.getSparkline(stock.code) ?? []"
          @open="handleOpenDetail(stock.code)"
          @hover="handleStockHover(stock.code)"
          @leave="handleStockLeave(stock.code)"
          @drag-enter="handleDragEnter('stock', index)"
          @contextmenu="openContextMenu($event, 'stock', stock.code, index)"
          @start-drag="startDrag($event, 'stock', stock.code, index)"
          @remove="handleRemoveAsset('stock', stock.code)"
        />
      </template>
      <template v-if="stockStore.activeAssetType === 'fund'">
        <WatchlistFundCard
          v-for="(fund, index) in stockStore.fundList"
          :key="fund.code"
          :fund="fund"
          :index="index"
          :selected="isFundCardSelected(fund.code)"
          :dragging="isDragging('fund', fund.code)"
          :drag-over="isDragOver('fund', index)"
          :has-position="hasFundPositionDetail(fund)"
          :show-sparkline="settingsStore.settings.showSparklines"
          :quote="getFundDisplayQuote(fund)"
          :meta="getFundQuoteMeta(fund)"
          :metrics="getFundPositionMetrics(fund)"
          @open="handleSelectFund(fund.code)"
          @hover="handleFundHover(fund.code)"
          @leave="handleFundLeave(fund.code)"
          @drag-enter="handleDragEnter('fund', index)"
          @contextmenu="openContextMenu($event, 'fund', fund.code, index)"
          @start-drag="startDrag($event, 'fund', fund.code, index)"
          @remove="handleRemoveAsset('fund', fund.code)"
        />
      </template>
    </div>

    <div class="bottom-bar">
      <WatchlistSearchBar
        :query="searchQuery"
        :placeholder="searchPlaceholder"
        :error="searchError"
        :show-results="showSearch"
        :results="searchResults"
        @update:query="searchQuery = $event"
        @input="handleSearch"
        @focus="showSearch = true"
        @blur="handleBlur"
        @enter="handleEnter"
        @select="handleSelect"
      />

      <WatchlistStatusBar
        ref="statusBarRef"
        :refresh-error="stockStore.activeRefreshError"
        :stale="stockStore.activeDataStale"
        :freshness-level="stockStore.quoteFreshness.level"
        :freshness-title="stockStore.quoteFreshness.label || undefined"
        :freshness-text="freshnessText"
        @import="openImportPicker"
        @file="handleImportFile"
        @market="openMarketView"
        @refresh="handleRefresh"
      />
    </div>

    <WatchlistPositionDialog
      v-if="positionDialog.visible"
      ref="positionDialogRef"
      :dialog="positionDialog"
      @close="closePositionDialog"
      @save="savePositionDialog"
      @clear="clearPositionDialog"
      @keydown="handlePositionDialogKeydown"
    />
    <ImportDialog
      v-if="importDialog.visible"
      :visible="importDialog.visible"
      :lines="importDialog.lines"
      @close="closeImportDialog"
      @imported="handleImported"
    />

    <WatchlistContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :actions="contextActions"
      @action="onContextMenuAction"
    />
  </div>
</template>

<script setup lang="ts">
import '../styles/watchlistDensity.css'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import ImportDialog from '../components/ImportDialog.vue'
import WatchlistStockCard from '../components/watchlist/WatchlistStockCard.vue'
import WatchlistFundCard from '../components/watchlist/WatchlistFundCard.vue'
import WatchlistSearchBar from '../components/watchlist/WatchlistSearchBar.vue'
import WatchlistContextMenu from '../components/watchlist/WatchlistContextMenu.vue'
import WatchlistAccountSummary from '../components/watchlist/WatchlistAccountSummary.vue'
import WatchlistPositionDialog from '../components/watchlist/WatchlistPositionDialog.vue'
import WatchlistStatusBar from '../components/watchlist/WatchlistStatusBar.vue'
import { logError } from '../utils/logger'
import {
  searchFunds,
  searchStock,
  type AssetType,
  type FundQuote,
  type FundSearchResult,
  type SearchResult
} from '../api/stock'
import { useSettingsStore } from '../stores/settings'
import { useStockStore } from '../stores/stock'
import { resolveFundDisplayQuote, localDateKey, type FundDisplayQuote } from '../utils/fundQuote'
import { deriveFundPosition } from '../utils/fundLedger'
import { focusFirstModalControl, trapModalFocus } from '../utils/modalFocus'
import {
  formatCompactMoney
} from '../utils/format'
import {
  calculateFundAccountSummary,
  calculateFundPositionMetrics,
  calculateStockAccountSummary,
  getProfitTone,
  type FundAccountSummary,
  type FundPositionForSummary,
  type PositionMetrics,
  type StockAccountSummary
} from '../utils/positions'

type ContextActionKey = 'edit-position' | 'move-up' | 'move-down' | 'move-top' | 'move-bottom'
type SearchItem = SearchResult | FundSearchResult

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  code: string
  index: number
  assetType: AssetType
}

interface DragState {
  assetType: AssetType
  code: string
  fromIndex: number
  overIndex: number
  pointerId: number
  startX: number
  startY: number
  active: boolean
}

interface PositionDialogState {
  visible: boolean
  assetType: AssetType
  code: string
  stockCostPrice: string
  stockShares: string
  fundHoldingAmount: string
  fundProfit: string
  error: string
}

const MENU_WIDTH = 132
const MENU_ITEM_HEIGHT = 34
const MENU_OFFSET = 8
const DRAG_THRESHOLD = 6
const EDGE_SCROLL_ZONE = 28

const props = defineProps<{ selectedCode: string }>()
const emit = defineEmits<{
  selectDetail: [selection: { assetType: AssetType; code: string }]
  assetTypeChange: [assetType: AssetType]
}>()

const stockStore = useStockStore()
const settingsStore = useSettingsStore()

const listRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const searchResults = ref<SearchItem[]>([])
const showSearch = ref(false)
const searchError = ref('')
const hoveredStockCode = ref('')
const hoveredFundCode = ref('')
const dragState = ref<DragState | null>(null)
const suppressNextCardClick = ref(false)
const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  code: '',
  index: -1,
  assetType: 'stock'
})
const positionDialog = ref<PositionDialogState>({
  visible: false,
  assetType: 'stock',
  code: '',
  stockCostPrice: '',
  stockShares: '',
  fundHoldingAmount: '',
  fundProfit: '',
  error: ''
})
const positionDialogRef = ref<{ formEl?: HTMLElement | null } | null>(null)

let searchTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null
let suppressClickTimer: ReturnType<typeof setTimeout> | null = null
let searchErrorTimer: ReturnType<typeof setTimeout> | null = null
let activeSearchRequest = 0
let dragHandleElement: HTMLElement | null = null
let positionDialogTrigger: HTMLElement | null = null

const activeListLength = computed(() =>
  stockStore.activeAssetType === 'stock'
    ? stockStore.stockList.length
    : stockStore.fundList.length
)

const emptyTitle = computed(() => stockStore.activeAssetType === 'stock' ? '暂无股票' : '暂无基金')
const emptyHint = computed(() => stockStore.activeAssetType === 'stock' ? '从下方搜索框添加股票' : '从下方搜索框添加基金')
const searchPlaceholder = computed(() => stockStore.activeAssetType === 'stock' ? '搜索股票名称或代码' : '搜索基金名称或代码')
const stockAccountSummary = computed<StockAccountSummary | null>(() =>
  calculateStockAccountSummary(stockStore.stockPositions, stockStore.stockList)
)
const fundAccountQuotes = computed(() => stockStore.fundList.map((fund) => {
  const display = resolveFundDisplayQuote(fund)
  return {
    code: fund.code,
    estimateNav: display.source === 'estimate' ? display.nav : null,
    officialNav: typeof fund.nav === 'number' && Number.isFinite(fund.nav) && fund.nav > 0
      ? fund.nav
      : null
  }
}))
const fundAccountPositions = computed(() => Object.fromEntries(
  stockStore.fundList.flatMap((fund) => {
    const position = getFundPositionForSummary(fund)
    return position ? [[fund.code, position] as const] : []
  })
))
const fundAccountSummary = computed<FundAccountSummary | null>(() =>
  calculateFundAccountSummary(fundAccountPositions.value, fundAccountQuotes.value)
)
const activeAccountSummary = computed<StockAccountSummary | FundAccountSummary | null>(() =>
  stockStore.activeAssetType === 'stock' ? stockAccountSummary.value : fundAccountSummary.value
)
const showAccountSummary = computed(() => Boolean(activeAccountSummary.value))
const accountSummaryCards = computed(() => {
  const summary = activeAccountSummary.value
  return [
    {
      label: '账户资金',
      value: formatCompactAccountMoney(summary?.accountAssets),
      title: formatAccountSummaryMoney(summary?.accountAssets),
      toneClass: ''
    },
    {
      label: '当日预计收益',
      value: formatCompactAccountMoney(summary?.estimatedDailyProfit, true),
      title: formatAccountSummaryMoney(summary?.estimatedDailyProfit, true),
      toneClass: getPositionToneClass(summary?.estimatedDailyProfit ?? 0)
    },
    {
      label: '账户总收益',
      value: formatCompactAccountMoney(summary?.totalProfit, true),
      title: formatAccountSummaryMoney(summary?.totalProfit, true),
      toneClass: getPositionToneClass(summary?.totalProfit ?? 0)
    }
  ]
})

const contextListLength = computed(() =>
  contextMenu.value.assetType === 'stock'
    ? stockStore.stockList.length
    : stockStore.fundList.length
)

const contextActions = computed(() => [
  {
    key: 'edit-position' as const,
    label: contextMenu.value.assetType === 'stock' ? '录入持仓' : '录入持有',
    disabled: contextMenu.value.index === -1
  },
  { key: 'move-up' as const, label: '上移', disabled: contextMenu.value.index <= 0 },
  { key: 'move-down' as const, label: '下移', disabled: contextMenu.value.index === -1 || contextMenu.value.index >= contextListLength.value - 1 },
  { key: 'move-top' as const, label: '置顶', disabled: contextMenu.value.index <= 0 },
  { key: 'move-bottom' as const, label: '置底', disabled: contextMenu.value.index === -1 || contextMenu.value.index >= contextListLength.value - 1 }
])

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

const freshnessText = computed(() => {
  if (stockStore.activeAssetType === 'stock' && stockStore.quoteFreshness.label) {
    return stockStore.quoteFreshness.label
  }
  return stockStore.lastUpdate ? formatTime(stockStore.lastUpdate) : '--:--:--'
})

function resetSearchState() {
  searchResults.value = []
  showSearch.value = false
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function switchAssetType(assetType: AssetType) {
  if (stockStore.activeAssetType === assetType) {
    return
  }

  closeContextMenu()
  cancelDrag()
  resetSearchState()
  hoveredStockCode.value = ''
  hoveredFundCode.value = ''
  searchQuery.value = ''
  stockStore.setActiveAssetType(assetType)
  emit('assetTypeChange', assetType)
}

function handleOpenDetail(code: string) {
  if (suppressNextCardClick.value || dragState.value?.active) {
    return
  }

  closeContextMenu()
  emit('selectDetail', { assetType: 'stock', code })
}

function clampContextMenuPosition(x: number, y: number) {
  const menuHeight = contextActions.value.length * MENU_ITEM_HEIGHT + 12
  const maxX = Math.max(MENU_OFFSET, window.innerWidth - MENU_WIDTH - MENU_OFFSET)
  const maxY = Math.max(MENU_OFFSET, window.innerHeight - menuHeight - MENU_OFFSET)

  return {
    x: Math.min(Math.max(MENU_OFFSET, x), maxX),
    y: Math.min(Math.max(MENU_OFFSET, y), maxY)
  }
}

function openContextMenu(event: MouseEvent, assetType: AssetType, code: string, index: number) {
  const position = clampContextMenuPosition(event.clientX, event.clientY)
  contextMenu.value = {
    visible: true,
    x: position.x,
    y: position.y,
    code,
    index,
    assetType
  }
}

function onContextMenuAction(key: string) {
  handleContextAction(key as ContextActionKey)
}

function handleContextAction(action: ContextActionKey) {
  const { assetType, code, index } = contextMenu.value
  if (!code || index < 0) {
    return
  }

  if (action === 'edit-position') {
    openPositionDialog(assetType, code)
    closeContextMenu()
    return
  }

  if (assetType === 'stock') {
    switch (action) {
      case 'move-up':
        stockStore.moveStock(index, index - 1)
        break
      case 'move-down':
        stockStore.moveStock(index, index + 1)
        break
      case 'move-top':
        stockStore.moveStockToTop(code)
        break
      case 'move-bottom':
        stockStore.moveStockToBottom(code)
        break
    }
  } else {
    switch (action) {
      case 'move-up':
        stockStore.moveFund(index, index - 1)
        break
      case 'move-down':
        stockStore.moveFund(index, index + 1)
        break
      case 'move-top':
        stockStore.moveFundToTop(code)
        break
      case 'move-bottom':
        stockStore.moveFundToBottom(code)
        break
    }
  }

  closeContextMenu()
}

function getFundPositionMetrics(fund: FundQuote): PositionMetrics | null {
  return calculateFundPositionMetrics(getFundPosition(fund))
}

function getFundPosition(fund: FundQuote) {
  const ledger = stockStore.fundLedgers[fund.code]
  if (ledger) {
    const display = getFundDisplayQuote(fund)
    if (typeof display.nav === 'number' && Number.isFinite(display.nav) && display.nav > 0) {
      const position = deriveFundPosition(ledger, display.nav)
      return {
        holdingAmount: position.currentValue,
        profit: position.totalProfit
      }
    }
  }

  return stockStore.fundPositions[fund.code]
}

/**
 * 账户汇总用的持仓口径：当日（估算）收益按主流规则计算——
 * （估算净值 - 昨日官方净值）× 昨日收盘份额，当日买入的份额不计当日收益。
 */
function getFundPositionForSummary(fund: FundQuote): FundPositionForSummary | null {
  const ledger = stockStore.fundLedgers[fund.code]
  const display = getFundDisplayQuote(fund)

  if (ledger && typeof display.nav === 'number' && Number.isFinite(display.nav) && display.nav > 0) {
    try {
      const view = deriveFundPosition(ledger, display.nav)
      const todayKey = localDateKey(new Date())
      const sharesBoughtToday = ledger.transactions
        .filter((transaction) => transaction.type === 'buy' && transaction.tradeDate === todayKey)
        .reduce((total, transaction) => total + transaction.shares, 0)

      return {
        shares: view.shares - sharesBoughtToday,
        currentValue: view.currentValue,
        profit: view.totalProfit
      }
    } catch {
      // 计算失败时退回旧版金额口径
    }
  }

  const legacy = stockStore.fundPositions[fund.code]
  return legacy ? { shares: null, currentValue: legacy.holdingAmount, profit: legacy.profit } : null
}

function getFundDisplayQuote(fund: FundQuote): FundDisplayQuote {
  return resolveFundDisplayQuote(fund)
}

function getFundQuoteMeta(fund: FundQuote): string {
  return fund.sector || '板块待更新'
}

function isStockCardSelected(code: string): boolean {
  return code === props.selectedCode || code === hoveredStockCode.value
}

function isFundCardSelected(code: string): boolean {
  return code === props.selectedCode || code === hoveredFundCode.value
}

function hasFundPositionDetail(fund: FundQuote): boolean {
  return isFundCardSelected(fund.code) && Boolean(getFundPositionMetrics(fund))
}

function handleStockHover(code: string) {
  hoveredStockCode.value = code
}

function handleStockLeave(code: string) {
  if (hoveredStockCode.value === code) {
    hoveredStockCode.value = ''
  }
}

function handleFundHover(code: string) {
  hoveredFundCode.value = code
}

function handleFundLeave(code: string) {
  if (hoveredFundCode.value === code) {
    hoveredFundCode.value = ''
  }
}

function formatAccountSummaryMoney(value: number | null | undefined, signed = false): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--'
  }

  const amount = Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
  if (!signed) {
    return `¥${amount}`
  }

  const sign = value > 0 ? '+' : value < 0 ? '-' : ''
  return `${sign}¥${amount}`
}

function formatCompactAccountMoney(value: number | null | undefined, signed = false): string {
  if (value === undefined || value === null) return '--'
  return formatCompactMoney(value, signed)
}

function getPositionToneClass(value: number | undefined): string {
  return `position-${getProfitTone(value ?? 0)}`
}

function parsePositionNumber(value: string): number | null {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function openPositionDialog(assetType: AssetType, code: string) {
  const stockPosition = stockStore.stockPositions[code]
  const fund = stockStore.getFund(code)
  const fundPosition = fund ? getFundPosition(fund) : stockStore.fundPositions[code]

  positionDialog.value = {
    visible: true,
    assetType,
    code,
    stockCostPrice: stockPosition ? String(stockPosition.costPrice) : '',
    stockShares: stockPosition ? String(stockPosition.shares) : '',
    fundHoldingAmount: fundPosition ? String(fundPosition.holdingAmount) : '',
    fundProfit: fundPosition ? String(fundPosition.profit) : '',
    error: ''
  }
  positionDialogTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  void nextTick(() => focusFirstModalControl(positionDialogRef.value?.formEl ?? null))
}

function closePositionDialog() {
  positionDialog.value.visible = false
  void nextTick(() => {
    positionDialogTrigger?.focus()
    positionDialogTrigger = null
  })
}

function handlePositionDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    closePositionDialog()
    return
  }
  trapModalFocus(event, positionDialogRef.value?.formEl ?? null)
}

function savePositionDialog() {
  const dialog = positionDialog.value

  if (dialog.assetType === 'stock') {
    const costPrice = parsePositionNumber(dialog.stockCostPrice)
    const shares = parsePositionNumber(dialog.stockShares)
    if (!costPrice || !shares || costPrice <= 0 || shares <= 0) {
      positionDialog.value = { ...dialog, error: '请输入有效的成本价和股数' }
      return
    }

    stockStore.setStockPosition(dialog.code, { costPrice, shares })
  } else {
    const holdingAmount = parsePositionNumber(dialog.fundHoldingAmount)
    const profit = parsePositionNumber(dialog.fundProfit)
    if (!holdingAmount || profit === null || holdingAmount <= 0 || holdingAmount - profit <= 0) {
      positionDialog.value = { ...dialog, error: '请输入有效的持有金额和收益' }
      return
    }

    stockStore.setFundPosition(dialog.code, { holdingAmount, profit })
  }

  closePositionDialog()
}

function clearPositionDialog() {
  if (positionDialog.value.assetType === 'stock') {
    stockStore.clearStockPosition(positionDialog.value.code)
  } else {
    stockStore.clearFundPosition(positionDialog.value.code)
  }

  closePositionDialog()
}

function handleSelectFund(code: string) {
  if (suppressNextCardClick.value || dragState.value?.active) {
    return
  }

  closeContextMenu()
  emit('selectDetail', { assetType: 'fund', code })
}

function setSuppressNextCardClick() {
  suppressNextCardClick.value = true
  if (suppressClickTimer) {
    clearTimeout(suppressClickTimer)
  }

  suppressClickTimer = setTimeout(() => {
    suppressNextCardClick.value = false
    suppressClickTimer = null
  }, 120)
}

function startDrag(event: PointerEvent, assetType: AssetType, code: string, index: number) {
  closeContextMenu()
  dragHandleElement = event.currentTarget as HTMLElement
  dragHandleElement.setPointerCapture?.(event.pointerId)
  dragState.value = {
    assetType,
    code,
    fromIndex: index,
    overIndex: index,
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    active: false
  }

  window.addEventListener('pointermove', handleDragMove)
  window.addEventListener('pointerup', finishDrag)
  window.addEventListener('pointercancel', cancelDrag)
}

function handleDragMove(event: PointerEvent) {
  const state = dragState.value
  if (!state || event.pointerId !== state.pointerId) {
    return
  }

  const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY)
  if (!state.active && distance >= DRAG_THRESHOLD) {
    dragState.value = { ...state, active: true }
  }

  if (!dragState.value?.active) {
    return
  }

  updateDragTargetFromPoint(event.clientX, event.clientY)
  scrollListNearEdges(event.clientY)
}

function updateDragTargetFromPoint(clientX: number, clientY: number) {
  const state = dragState.value
  if (!state) {
    return
  }

  const element = document.elementFromPoint(clientX, clientY) as HTMLElement | null
  const card = element?.closest<HTMLElement>('[data-drag-card="true"]')
  if (!card || card.dataset.assetType !== state.assetType) {
    return
  }

  const overIndex = Number(card.dataset.index)
  if (Number.isInteger(overIndex)) {
    dragState.value = { ...state, overIndex }
  }
}

function scrollListNearEdges(clientY: number) {
  const list = listRef.value
  if (!list) {
    return
  }

  const rect = list.getBoundingClientRect()
  if (clientY < rect.top + EDGE_SCROLL_ZONE) {
    list.scrollTop -= 8
  } else if (clientY > rect.bottom - EDGE_SCROLL_ZONE) {
    list.scrollTop += 8
  }
}

function handleDragEnter(assetType: AssetType, index: number) {
  const state = dragState.value
  if (!state?.active || state.assetType !== assetType) {
    return
  }

  dragState.value = { ...state, overIndex: index }
}

function cleanupDragListeners() {
  window.removeEventListener('pointermove', handleDragMove)
  window.removeEventListener('pointerup', finishDrag)
  window.removeEventListener('pointercancel', cancelDrag)
}

function finishDrag(event: PointerEvent) {
  const state = dragState.value
  if (!state || event.pointerId !== state.pointerId) {
    return
  }

  const shouldMove = state.active && state.overIndex !== state.fromIndex
  if (shouldMove) {
    if (state.assetType === 'stock') {
      stockStore.moveStock(state.fromIndex, state.overIndex)
    } else {
      stockStore.moveFund(state.fromIndex, state.overIndex)
    }
  }

  if (state.active) {
    setSuppressNextCardClick()
  }

  releaseDragCapture(event.pointerId)
  dragState.value = null
  cleanupDragListeners()
}

function cancelDrag(event?: PointerEvent) {
  if (event && dragState.value && event.pointerId !== dragState.value.pointerId) {
    return
  }

  releaseDragCapture(event?.pointerId)
  dragState.value = null
  cleanupDragListeners()
}

function releaseDragCapture(pointerId: number | undefined) {
  if (pointerId !== undefined && dragHandleElement?.hasPointerCapture?.(pointerId)) {
    dragHandleElement.releasePointerCapture(pointerId)
  }
  dragHandleElement = null
}

function isDragging(assetType: AssetType, code: string) {
  return dragState.value?.active === true
    && dragState.value.assetType === assetType
    && dragState.value.code === code
}

function isDragOver(assetType: AssetType, index: number) {
  return dragState.value?.active === true
    && dragState.value.assetType === assetType
    && dragState.value.overIndex === index
    && dragState.value.fromIndex !== index
}

async function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  if (searchError.value) {
    searchError.value = ''
    if (searchErrorTimer) {
      clearTimeout(searchErrorTimer)
      searchErrorTimer = null
    }
  }
  searchTimer = setTimeout(async () => {
    const keyword = searchQuery.value.trim()
    if (!keyword) {
      resetSearchState()
      return
    }

    const assetType = stockStore.activeAssetType
    const requestId = ++activeSearchRequest
    const results = assetType === 'stock'
      ? await searchStock(keyword)
      : await searchFunds(keyword)

    if (requestId !== activeSearchRequest || assetType !== stockStore.activeAssetType) {
      return
    }

    searchResults.value = results
    showSearch.value = results.length > 0
  }, 220)
}

async function handleSelect(code: string) {
  const assetType = stockStore.activeAssetType
  const succeeded = assetType === 'stock'
    ? await stockStore.addStock(code)
    : await stockStore.addFund(code)

  searchQuery.value = ''
  resetSearchState()
  if (!succeeded) {
    searchError.value = assetType === 'stock'
      ? '未找到该股票，添加失败'
      : '未找到该场外基金，添加失败'
    if (searchErrorTimer) {
      clearTimeout(searchErrorTimer)
    }
    searchErrorTimer = setTimeout(() => {
      searchError.value = ''
      searchErrorTimer = null
    }, 3000)
    return
  }

  searchError.value = ''
}

function handleEnter() {
  if (searchResults.value.length > 0) {
    void handleSelect(searchResults.value[0].code)
    return
  }

  const directCode = searchQuery.value.trim()
  if (directCode) {
    void handleSelect(directCode)
  }
}

function handleBlur() {
  blurTimer = setTimeout(() => {
    resetSearchState()
    blurTimer = null
  }, 180)
}

async function handleRefresh() {
  closeContextMenu()
  await stockStore.refreshAll()
}

function openMarketView() {
  closeContextMenu()
  stockStore.setActiveAssetType('market')
}

const statusBarRef = ref<{ pickFile?: () => void } | null>(null)
const importDialog = ref<{ visible: boolean; lines: string[] }>({ visible: false, lines: [] })
let importOcrBusy = false

function openImportPicker(): void {
  closeContextMenu()
  statusBarRef.value?.pickFile?.()
}

async function handleImportFile(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importOcrBusy) {
    return
  }

  importOcrBusy = true
  searchError.value = '正在识别图片…'
  try {
    const dataUrl = await readFileAsDataUrl(file)
    const lines = await Promise.race([
      invoke<string[]>('ocr_image', { imageBase64: dataUrl }),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('图片识别超时，请换小一点的截图')), 90_000)
      })
    ]) as string[]
    searchError.value = ''
    importDialog.value = { visible: true, lines }
  } catch (error) {
    searchError.value = error instanceof Error ? error.message : String(error)
    logError('图片识别失败', error)
  } finally {
    importOcrBusy = false
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

function closeImportDialog(): void {
  importDialog.value = { ...importDialog.value, visible: false }
}

function handleImported(summary: string): void {
  searchError.value = summary
  if (searchErrorTimer) {
    clearTimeout(searchErrorTimer)
  }
  searchErrorTimer = setTimeout(() => {
    searchError.value = ''
    searchErrorTimer = null
  }, 3000)
}

async function handleRemoveAsset(assetType: AssetType, code: string) {
  closeContextMenu()
  if (assetType === 'stock') {
    await stockStore.removeStock(code)
  } else {
    await stockStore.removeFund(code)
  }
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    if (positionDialog.value.visible) {
      closePositionDialog()
    }
    closeContextMenu()
    cancelDrag()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('resize', closeContextMenu)
  window.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (blurTimer) clearTimeout(blurTimer)
  if (suppressClickTimer) clearTimeout(suppressClickTimer)
  if (searchErrorTimer) clearTimeout(searchErrorTimer)
  cancelDrag()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', closeContextMenu)
  window.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.home-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0;gap:0}
.asset-tabs{display:none;align-items:center;gap:2px;margin:0 10px 2px;padding:3px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.035)}
.asset-tab{flex:1;height:24px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);font-size:12px;font-weight:700;cursor:pointer;transition:background .15s ease,color .15s ease}
.asset-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.045)}
.asset-tab.active{color:#f8fbff;background:rgba(45,124,246,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.bottom-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:8px;padding:4px 10px 6px}
.search-shell{position:relative;min-width:0;width:100%}
.search-shell input{width:100%;min-width:0;height:26px;padding:0 8px 0 28px;border:1px solid rgba(255,255,255,.08);border-radius:8px;outline:none;background:rgba(255,255,255,.03);color:var(--text-primary);font-size:12px;transition:border-color .18s ease,background .18s ease}
.search-shell input::placeholder{color:var(--text-muted)}
.search-shell input:focus{border-color:rgba(59,130,246,.4);background:rgba(255,255,255,.045)}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none}
.search-error{position:absolute;bottom:calc(100% + 8px);left:0;z-index:11;padding:7px 10px;border:1px solid rgba(248,113,113,.3);border-radius:8px;background:var(--solid-bg);color:#ff9c9c;font-size:12px;white-space:nowrap}
.search-results{position:absolute;bottom:calc(100% + 8px);left:0;z-index:10;padding:6px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 20px 48px rgba(0,0,0,.34);min-width:220px}
.search-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border:none;border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;white-space:nowrap;min-width:208px}
.search-item:hover{background:rgba(255,255,255,.05)}
.search-name{font-size:13px;font-weight:600;white-space:nowrap}.search-code{font-size:12px;color:var(--text-muted);white-space:nowrap}
.bottom-actions{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.import-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.import-btn:hover{color:#5da8ff;background:rgba(45,124,246,.14)}
.import-file-input{display:none}
.market-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.market-btn:hover{color:#5da8ff;background:rgba(45,124,246,.14)}
.refresh-status{display:inline-flex;align-items:center;height:20px;padding:0 5px;border:1px solid rgba(248,113,113,.3);border-radius:5px;background:rgba(248,113,113,.09);color:#ff8c8c;font-size:9px;font-weight:700;white-space:nowrap}
.refresh-status.stale{border-color:rgba(245,158,11,.28);background:rgba(245,158,11,.08);color:#fbbf57}
.refresh-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.refresh-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}
.update-time{font-size:11px;color:var(--text-muted)}.update-time.delayed{color:#fbbf57}.update-time.stale{color:#f59e0b}
.stock-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:6px 10px 0}
.fund-account-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:2px}
.fund-account-card{min-width:0;padding:8px 7px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.04);box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
.fund-account-card span{display:block;margin-bottom:5px;font-size:10px;line-height:1;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fund-account-card strong{display:block;min-width:0;font-size:12px;line-height:1.05;font-weight:900;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:0}
.fund-account-card strong.position-profit{color:#ff7474}
.fund-account-card strong.position-loss{color:#3ad283}
.fund-account-card strong.position-flat{color:var(--text-secondary)}
.stock-card{position:relative;display:flex;align-items:center;gap:7px;width:100%;padding:6px 10px 6px 6px;border:1px solid transparent;border-radius:8px;background:rgba(255,255,255,.025);cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease,opacity .18s ease,padding .18s ease;min-height:44px;text-align:left;color:inherit;outline:none}
.stock-card:hover{transform:translateX(2px);background:rgba(255,255,255,.05)}
.stock-card:focus-visible{border-color:rgba(93,168,255,.55)}
.stock-card:hover,.stock-card:focus-within,.stock-card.selected{padding-right:34px}
.stock-card.with-position{flex-wrap:wrap;align-items:flex-start;min-height:72px}
.stock-card.selected{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.085);box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.stock-card.selected::before{content:'';position:absolute;inset:6px auto 6px 0;width:3px;border-radius:999px;background:linear-gradient(180deg,#5da8ff,#2d7cf6)}
.stock-card.dragging{opacity:.55;transform:scale(.99);cursor:grabbing}
.stock-card.drag-over{border-color:rgba(45,156,255,.62);background:rgba(45,156,255,.10)}
.drag-handle{width:22px;height:30px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:0 0 22px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:grab;touch-action:none;transition:background .15s ease,color .15s ease}
.drag-handle span{width:12px;height:2px;border-radius:999px;background:currentColor}
.drag-handle:hover{color:var(--text-primary);background:rgba(255,255,255,.055)}
.drag-handle:active{cursor:grabbing}
.stock-main{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.stock-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex-shrink:0}
.stock-name{font-size:13px;font-weight:700;line-height:1.05;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:116px}
.stock-code{font-size:11px;color:var(--text-muted);letter-spacing:0}
.stock-sparkline-wrap{min-width:0;flex:1;height:18px;max-width:110px;overflow:hidden}
.stock-sparkline{display:block;width:100%;height:100%}
.stock-sparkline-line{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.92}
.stock-sparkline-line.up{stroke:#ff7b7b}
.stock-sparkline-line.down{stroke:#39cf84}
.stock-side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.change-pill{display:inline-flex;align-items:center;justify-content:center;min-width:64px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:0}
.change-pill.up{color:#ff7474;background:rgba(239,68,68,.14)}.change-pill.down{color:#3ad283;background:rgba(34,197,94,.12)}
.stock-price{font-size:13px;line-height:1;font-weight:500;letter-spacing:0;color:var(--text-secondary)}
.position-strip{flex:1 0 calc(100% - 29px);margin-left:29px;margin-top:2px;display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.035);font-size:10px;line-height:1.2;color:var(--text-muted)}
.position-strip strong{grid-column:1 / -1;font-size:11px;font-weight:800;color:var(--text-secondary)}
.position-strip.position-profit strong{color:#ff7474}
.position-strip.position-loss strong{color:#3ad283}
.position-strip.position-flat strong{color:var(--text-muted)}
.remove-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:rgba(239,68,68,.12);color:#fca5a5;cursor:pointer;opacity:0;pointer-events:none;transition:opacity .15s ease,background .15s ease}
.stock-card:hover .remove-btn,.stock-card:focus-within .remove-btn,.stock-card.selected .remove-btn{opacity:1}
.stock-card:hover .remove-btn,.stock-card:focus-within .remove-btn,.stock-card.selected .remove-btn{pointer-events:auto}
.remove-btn:hover{background:rgba(239,68,68,.22)}
.fund-card{align-items:center;min-height:58px;cursor:pointer}
.fund-card:hover{transform:none}
.fund-card.with-position{align-items:flex-start;min-height:86px}
.fund-main-list{min-width:0;flex:1;display:flex;flex-direction:column;gap:6px;padding-top:1px}
.fund-title{max-width:176px;font-size:13px;font-weight:800;line-height:1.12;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fund-code-line{display:flex;align-items:center;gap:6px;min-width:0}
.fund-quote-side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:72px;flex-shrink:0}
.fund-change-value{font-size:17px;font-weight:900;line-height:1;letter-spacing:0}
.fund-change-value.up{color:#ff6868}.fund-change-value.down{color:#32ce7b}
.fund-estimate-value{font-size:12px;font-weight:700;line-height:1;color:#8f99bb}
.fund-quote-meta{font-size:8px;font-weight:650;line-height:1;color:var(--text-muted);white-space:nowrap}
.fund-quote-meta.estimate{color:#f0a35b}
.position-overlay{position:absolute;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.44)}
.position-dialog{width:min(250px,100%);padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
.position-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.position-dialog-header h3{margin:0;font-size:14px;line-height:1.2;color:var(--text-primary)}
.position-close-btn{width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1}
.position-close-btn:hover{background:rgba(255,255,255,.06);color:var(--text-primary)}
.position-fields{display:flex;flex-direction:column;gap:9px}
.position-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--text-muted)}
.position-field input{height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.10);border-radius:8px;background:rgba(255,255,255,.04);color:var(--text-primary);font-size:13px;outline:none}
.position-field input:focus{border-color:rgba(59,130,246,.45);background:rgba(255,255,255,.06)}
.position-error{margin:0;color:#fca5a5;font-size:12px}
.position-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
.position-secondary-btn,.position-primary-btn{height:30px;padding:0 12px;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}
.position-secondary-btn{background:rgba(255,255,255,.06);color:var(--text-secondary)}
.position-primary-btn{background:rgba(45,124,246,.82);color:#fff}
.position-secondary-btn:hover{background:rgba(255,255,255,.10);color:var(--text-primary)}
.position-primary-btn:hover{background:rgba(45,124,246,.94)}
.context-menu{position:fixed;z-index:40;width:132px;padding:6px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.34);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.context-menu-item{width:100%;display:flex;align-items:center;height:34px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:var(--text-primary);font-size:13px;text-align:left;cursor:pointer}
.context-menu-item:hover:not(:disabled){background:rgba(255,255,255,.06)}
.context-menu-item:disabled{color:var(--text-muted);cursor:not-allowed}
.empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);text-align:center}
.empty-state p{font-size:14px;font-weight:600;color:var(--text-secondary)}.empty-state span{font-size:12px}
</style>
