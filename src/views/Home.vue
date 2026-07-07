<template>
  <div class="home-view" @click="closeContextMenu">
    <div class="asset-tabs" @click.stop>
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

      <template v-if="stockStore.activeAssetType === 'stock'">
        <div
          v-for="(stock, index) in stockStore.stockList"
          :key="stock.code"
          class="stock-card"
          :class="{
            selected: stock.code === props.selectedCode,
            dragging: isDragging('stock', stock.code),
            'drag-over': isDragOver('stock', index)
          }"
          role="button"
          tabindex="0"
          :title="`打开 ${stock.name} 详情`"
          data-drag-card="true"
          data-asset-type="stock"
          :data-index="index"
          @click.stop="handleOpenDetail(stock.code)"
          @keydown.enter.prevent="handleOpenDetail(stock.code)"
          @keydown.space.prevent="handleOpenDetail(stock.code)"
          @pointerenter="handleDragEnter('stock', index)"
          @contextmenu.prevent.stop="openContextMenu($event, 'stock', stock.code, index)"
        >
          <button
            class="drag-handle"
            type="button"
            title="拖动排序"
            @click.stop
            @pointerdown.stop.prevent="startDrag($event, 'stock', stock.code, index)"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div class="stock-main">
            <div class="stock-info">
              <div class="stock-name">{{ stock.name }}</div>
              <div class="stock-code">{{ stock.code }}</div>
            </div>
            <div v-if="settingsStore.settings.showSparklines && getSparklinePoints(stock.code)" class="stock-sparkline-wrap">
              <svg class="stock-sparkline" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
                <polyline
                  class="stock-sparkline-line"
                  :class="{ up: stock.changePercent >= 0, down: stock.changePercent < 0 }"
                  :points="getSparklinePoints(stock.code)"
                />
              </svg>
            </div>
          </div>

          <div class="stock-side">
            <div class="change-pill" :class="{ up: stock.changePercent >= 0, down: stock.changePercent < 0 }">
              {{ formatChange(stock.changePercent) }}
            </div>
            <div class="stock-price">{{ stock.price.toFixed(2) }}</div>
          </div>

          <button
            class="remove-btn"
            type="button"
            title="删除"
            @click.stop="handleRemoveAsset('stock', stock.code)"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </template>

      <template v-else>
        <div
          v-for="(fund, index) in stockStore.fundList"
          :key="fund.code"
          class="stock-card fund-card"
          :class="{
            dragging: isDragging('fund', fund.code),
            'drag-over': isDragOver('fund', index)
          }"
          data-drag-card="true"
          data-asset-type="fund"
          :data-index="index"
          @pointerenter="handleDragEnter('fund', index)"
          @contextmenu.prevent.stop="openContextMenu($event, 'fund', fund.code, index)"
        >
          <button
            class="drag-handle"
            type="button"
            title="拖动排序"
            @click.stop
            @pointerdown.stop.prevent="startDrag($event, 'fund', fund.code, index)"
          >
            <span></span>
            <span></span>
            <span></span>
          </button>

          <div class="stock-main fund-main">
            <div class="stock-info fund-info">
              <div class="stock-name">{{ fund.name }}</div>
              <div class="stock-code">{{ fund.code }}</div>
            </div>
            <div class="fund-meta">
              <div class="fund-row">
                <span>估算</span>
                <strong>{{ formatOptionalNumber(fund.estimateNav, 4) }}</strong>
              </div>
              <div class="fund-row">
                <span>单位净值</span>
                <strong>{{ formatOptionalNumber(fund.nav, 4) }}</strong>
              </div>
              <div class="fund-row muted">
                <span>{{ formatOptionalDate(fund.navDate) }}</span>
                <span>{{ formatOptionalDate(fund.estimateTime) }}</span>
              </div>
            </div>
          </div>

          <div class="stock-side fund-side">
            <div
              class="change-pill"
              :class="{
                up: (fund.estimateChangePercent ?? 0) >= 0,
                down: (fund.estimateChangePercent ?? 0) < 0
              }"
            >
              {{ formatSignedOptionalPercent(fund.estimateChangePercent) }}
            </div>
          </div>

          <button
            class="remove-btn"
            type="button"
            title="删除"
            @click.stop="handleRemoveAsset('fund', fund.code)"
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </template>
    </div>

    <div class="bottom-bar">
      <div class="search-shell">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="7" />
          <line x1="20" y1="20" x2="16.65" y2="16.65" />
        </svg>

        <input
          v-model="searchQuery"
          type="text"
          :placeholder="searchPlaceholder"
          @input="handleSearch"
          @focus="showSearch = true"
          @blur="handleBlur"
          @keydown.enter.prevent="handleEnter"
        />

        <div v-if="showSearch && searchResults.length > 0" class="search-results search-results-top">
          <button
            v-for="item in searchResults"
            :key="item.code"
            class="search-item"
            type="button"
            @mousedown.prevent="handleSelect(item.code)"
          >
            <span class="search-name">{{ item.name }}</span>
            <span class="search-code">{{ item.code }}</span>
          </button>
        </div>
      </div>

      <div class="bottom-actions">
        <button class="refresh-btn" type="button" title="刷新" @click.stop="handleRefresh">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <span class="update-time">{{ stockStore.lastUpdate ? formatTime(stockStore.lastUpdate) : '--:--:--' }}</span>
      </div>
    </div>

    <div
      v-if="contextMenu.visible"
      class="context-menu"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <button
        v-for="action in contextActions"
        :key="action.key"
        class="context-menu-item"
        type="button"
        :disabled="action.disabled"
        @click="handleContextAction(action.key)"
      >
        {{ action.label }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import {
  searchFunds,
  searchStock,
  type AssetType,
  type FundSearchResult,
  type SearchResult
} from '../api/stock'
import { useSettingsStore } from '../stores/settings'
import { useStockStore } from '../stores/stock'
import { createSparklinePoints } from '../utils/chart'
import {
  formatOptionalDate,
  formatOptionalNumber,
  formatSignedOptionalPercent
} from '../utils/format'

type ContextActionKey = 'move-up' | 'move-down' | 'move-top' | 'move-bottom'
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

const MENU_WIDTH = 132
const MENU_ITEM_HEIGHT = 34
const MENU_OFFSET = 8
const DRAG_THRESHOLD = 6
const EDGE_SCROLL_ZONE = 28

const props = defineProps<{ selectedCode: string }>()
const emit = defineEmits<{
  select: [code: string]
  assetTypeChange: [assetType: AssetType]
}>()

const stockStore = useStockStore()
const settingsStore = useSettingsStore()

const listRef = ref<HTMLElement | null>(null)
const searchQuery = ref('')
const searchResults = ref<SearchItem[]>([])
const showSearch = ref(false)
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

let searchTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null
let suppressClickTimer: ReturnType<typeof setTimeout> | null = null
let activeSearchRequest = 0
let dragHandleElement: HTMLElement | null = null

const activeListLength = computed(() =>
  stockStore.activeAssetType === 'stock'
    ? stockStore.stockList.length
    : stockStore.fundList.length
)

const emptyTitle = computed(() => stockStore.activeAssetType === 'stock' ? '暂无股票' : '暂无基金')
const emptyHint = computed(() => stockStore.activeAssetType === 'stock' ? '从下方搜索框添加股票' : '从下方搜索框添加基金')
const searchPlaceholder = computed(() => stockStore.activeAssetType === 'stock' ? '搜索股票名称或代码' : '搜索基金名称或代码')

const contextListLength = computed(() =>
  contextMenu.value.assetType === 'stock'
    ? stockStore.stockList.length
    : stockStore.fundList.length
)

const contextActions = computed(() => [
  { key: 'move-up' as const, label: '上移', disabled: contextMenu.value.index <= 0 },
  { key: 'move-down' as const, label: '下移', disabled: contextMenu.value.index === -1 || contextMenu.value.index >= contextListLength.value - 1 },
  { key: 'move-top' as const, label: '置顶', disabled: contextMenu.value.index <= 0 },
  { key: 'move-bottom' as const, label: '置底', disabled: contextMenu.value.index === -1 || contextMenu.value.index >= contextListLength.value - 1 }
])

function formatChange(percent: number): string {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function getSparklinePoints(code: string): string {
  return createSparklinePoints(stockStore.getSparkline(code))
}

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
  searchQuery.value = ''
  stockStore.setActiveAssetType(assetType)
  emit('assetTypeChange', assetType)
}

function handleOpenDetail(code: string) {
  if (suppressNextCardClick.value || dragState.value?.active) {
    return
  }

  closeContextMenu()
  emit('select', code)
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

function handleContextAction(action: ContextActionKey) {
  const { assetType, code, index } = contextMenu.value
  if (!code || index < 0) {
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
  if (stockStore.activeAssetType === 'stock') {
    await stockStore.addStock(code)
  } else {
    await stockStore.addFund(code)
  }

  searchQuery.value = ''
  resetSearchState()
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
    closeContextMenu()
    cancelDrag()
  }
}

onMounted(async () => {
  await stockStore.refreshAll()
  window.addEventListener('keydown', handleGlobalKeydown)
  window.addEventListener('resize', closeContextMenu)
  window.addEventListener('click', closeContextMenu)
})

onUnmounted(() => {
  if (searchTimer) clearTimeout(searchTimer)
  if (blurTimer) clearTimeout(blurTimer)
  if (suppressClickTimer) clearTimeout(suppressClickTimer)
  cancelDrag()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', closeContextMenu)
  window.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.home-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0;gap:0}
.asset-tabs{display:flex;align-items:center;gap:2px;margin:0 10px 2px;padding:3px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.035)}
.asset-tab{flex:1;height:24px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);font-size:12px;font-weight:700;cursor:pointer;transition:background .15s ease,color .15s ease}
.asset-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.045)}
.asset-tab.active{color:#f8fbff;background:rgba(45,124,246,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.bottom-bar{display:flex;align-items:center;gap:8px;padding:4px 10px 6px}
.search-shell{position:relative;min-width:0}
.search-shell input{max-width:125px;height:26px;padding:0 8px 0 28px;border:1px solid rgba(255,255,255,.08);border-radius:8px;outline:none;background:rgba(255,255,255,.03);color:var(--text-primary);font-size:12px;transition:border-color .18s ease,background .18s ease}
.search-shell input::placeholder{color:var(--text-muted)}
.search-shell input:focus{border-color:rgba(59,130,246,.4);background:rgba(255,255,255,.045)}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none}
.search-results{position:absolute;bottom:calc(100% + 8px);left:0;z-index:10;padding:6px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 20px 48px rgba(0,0,0,.34);min-width:220px}
.search-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border:none;border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;white-space:nowrap;min-width:208px}
.search-item:hover{background:rgba(255,255,255,.05)}
.search-name{font-size:13px;font-weight:600;white-space:nowrap}.search-code{font-size:12px;color:var(--text-muted);white-space:nowrap}
.bottom-actions{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.refresh-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.refresh-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}
.update-time{font-size:11px;color:var(--text-muted)}
.stock-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:6px 10px 0}
.stock-card{position:relative;display:flex;align-items:center;gap:7px;width:100%;padding:6px 34px 6px 6px;border:1px solid transparent;border-radius:8px;background:rgba(255,255,255,.025);cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease,opacity .18s ease;min-height:44px;text-align:left;color:inherit;outline:none}
.stock-card:hover{transform:translateX(2px);background:rgba(255,255,255,.05)}
.stock-card:focus-visible{border-color:rgba(93,168,255,.55)}
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
.remove-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:rgba(239,68,68,.12);color:#fca5a5;cursor:pointer;opacity:0;transition:opacity .15s ease,background .15s ease}
.stock-card:hover .remove-btn,.stock-card:focus-within .remove-btn{opacity:1}
.remove-btn:hover{background:rgba(239,68,68,.22)}
.fund-card{align-items:flex-start;min-height:78px;cursor:default}
.fund-card:hover{transform:none}
.fund-main{align-items:flex-start;flex-direction:column;gap:7px;padding-top:1px}
.fund-info{width:100%;padding-right:4px}
.fund-info .stock-name{max-width:168px}
.fund-meta{width:100%;display:flex;flex-direction:column;gap:3px}
.fund-row{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11px;color:var(--text-muted)}
.fund-row strong{font-size:12px;color:var(--text-secondary);font-weight:700}
.fund-row.muted{font-size:10px;color:rgba(255,255,255,.42)}
.fund-side{padding-top:2px}
.context-menu{position:fixed;z-index:40;width:132px;padding:6px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.34);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.context-menu-item{width:100%;display:flex;align-items:center;height:34px;padding:0 10px;border:none;border-radius:8px;background:transparent;color:var(--text-primary);font-size:13px;text-align:left;cursor:pointer}
.context-menu-item:hover:not(:disabled){background:rgba(255,255,255,.06)}
.context-menu-item:disabled{color:var(--text-muted);cursor:not-allowed}
.empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);text-align:center}
.empty-state p{font-size:14px;font-weight:600;color:var(--text-secondary)}.empty-state span{font-size:12px}
</style>
