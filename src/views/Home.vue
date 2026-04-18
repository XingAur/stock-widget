<template>
  <div class="home-view" @click="closeContextMenu">
    <div class="stock-list" @scroll="closeContextMenu">
      <div v-if="stockStore.stockList.length === 0" class="empty-state">
        <p>No stocks yet</p>
        <span>Add one from the search box below</span>
      </div>

      <button
        v-for="(stock, index) in stockStore.stockList"
        :key="stock.code"
        class="stock-card"
        :class="{ selected: stock.code === props.selectedCode }"
        type="button"
        :title="`Open ${stock.name} detail`"
        @click.stop="handleOpenDetail(stock.code)"
        @contextmenu.prevent.stop="openContextMenu($event, stock.code, index)"
      >
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
          title="Remove"
          @click.stop="handleRemoveStock(stock.code)"
        >
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </button>
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
          placeholder="搜索名称或代码"
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
        <button class="refresh-btn" type="button" title="Refresh" @click.stop="handleRefresh">
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
import { searchStock } from '../api/stock'
import { useSettingsStore } from '../stores/settings'
import { useStockStore } from '../stores/stock'

type ContextActionKey = 'move-up' | 'move-down' | 'move-top' | 'move-bottom'

interface ContextMenuState {
  visible: boolean
  x: number
  y: number
  code: string
  index: number
}

const MENU_WIDTH = 132
const MENU_ITEM_HEIGHT = 34
const MENU_OFFSET = 8

const props = defineProps<{ selectedCode: string }>()
const emit = defineEmits<{ select: [code: string] }>()

const stockStore = useStockStore()
const settingsStore = useSettingsStore()

const searchQuery = ref('')
const searchResults = ref<{ code: string; name: string; market: string }[]>([])
const showSearch = ref(false)
const contextMenu = ref<ContextMenuState>({
  visible: false,
  x: 0,
  y: 0,
  code: '',
  index: -1
})

const contextActions = computed(() => [
  { key: 'move-up' as const, label: '上移', disabled: contextMenu.value.index <= 0 },
  { key: 'move-down' as const, label: '下移', disabled: contextMenu.value.index === -1 || contextMenu.value.index >= stockStore.stockList.length - 1 },
  { key: 'move-top' as const, label: '置顶', disabled: contextMenu.value.index <= 0 },
  { key: 'move-bottom' as const, label: '置底', disabled: contextMenu.value.index === -1 || contextMenu.value.index >= stockStore.stockList.length - 1 }
])

let searchTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null

function formatChange(percent: number): string {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function getSparklinePoints(code: string): string {
  const prices = stockStore.getSparkline(code)
  if (!prices || prices.length < 2) {
    return ''
  }

  const width = 120
  const height = 24
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  return prices
    .map((price, index) => {
      const x = prices.length === 1 ? width / 2 : (index / (prices.length - 1)) * width
      const y = height - ((price - min) / range) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}

function resetSearchState() {
  searchResults.value = []
  showSearch.value = false
}

function closeContextMenu() {
  contextMenu.value.visible = false
}

function handleOpenDetail(code: string) {
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

function openContextMenu(event: MouseEvent, code: string, index: number) {
  const position = clampContextMenuPosition(event.clientX, event.clientY)
  contextMenu.value = {
    visible: true,
    x: position.x,
    y: position.y,
    code,
    index
  }
}

function handleContextAction(action: ContextActionKey) {
  const { code, index } = contextMenu.value
  if (!code || index < 0) {
    return
  }

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

  closeContextMenu()
}

async function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    const keyword = searchQuery.value.trim()
    if (!keyword) {
      resetSearchState()
      return
    }
    const results = await searchStock(keyword)
    searchResults.value = results
    showSearch.value = results.length > 0
  }, 220)
}

async function handleSelect(code: string) {
  await stockStore.addStock(code)
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

async function handleRemoveStock(code: string) {
  closeContextMenu()
  await stockStore.removeStock(code)
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    closeContextMenu()
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
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('resize', closeContextMenu)
  window.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.home-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0;gap:0}
.bottom-bar{display:flex;align-items:center;gap:8px;padding:4px 10px 6px}
.search-shell{position:relative;min-width:0}
.search-shell input{max-width:125px;height:26px;padding:0 8px 0 28px;border:1px solid rgba(255,255,255,.08);border-radius:8px;outline:none;background:rgba(255,255,255,.03);color:var(--text-primary);font-size:12px;transition:border-color .18s ease,background .18s ease}
.search-shell input::placeholder{color:var(--text-muted)}
.search-shell input:focus{border-color:rgba(59,130,246,.4);background:rgba(255,255,255,.045)}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none}
.search-results{position:absolute;bottom:calc(100% + 8px);left:0;z-index:10;padding:6px;border:1px solid var(--border-color);border-radius:16px;background:var(--solid-bg);box-shadow:0 20px 48px rgba(0,0,0,.34);min-width:220px}
.search-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border:none;border-radius:10px;background:transparent;color:var(--text-primary);cursor:pointer;white-space:nowrap;min-width:208px}
.search-item:hover{background:rgba(255,255,255,.05)}
.search-name{font-size:13px;font-weight:600;white-space:nowrap}.search-code{font-size:12px;color:var(--text-muted);white-space:nowrap}
.bottom-actions{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.refresh-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.refresh-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}
.update-time{font-size:11px;color:var(--text-muted)}
.stock-list{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;padding:6px 10px 0}
.stock-card{position:relative;display:flex;align-items:center;gap:8px;width:100%;padding:6px 12px 6px 10px;border:1px solid transparent;border-radius:12px;background:rgba(255,255,255,.025);cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease;min-height:44px;text-align:left;color:inherit}
.stock-card:hover{transform:translateX(2px);background:rgba(255,255,255,.05)}
.stock-card.selected{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.085);box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.stock-card.selected::before{content:'';position:absolute;inset:6px auto 6px 0;width:3px;border-radius:999px;background:linear-gradient(180deg,#5da8ff,#2d7cf6)}
.stock-main{display:flex;align-items:center;gap:10px;min-width:0;flex:1;padding-left:4px}
.stock-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex-shrink:0}
.stock-name{font-size:13px;font-weight:700;line-height:1.05;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.stock-code{font-size:11px;color:var(--text-muted);letter-spacing:.02em}
.stock-sparkline-wrap{min-width:0;flex:1;height:18px;max-width:140px;overflow:hidden}
.stock-sparkline{display:block;width:100%;height:100%}
.stock-sparkline-line{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.92}
.stock-sparkline-line.up{stroke:#ff7b7b}
.stock-sparkline-line.down{stroke:#39cf84}
.stock-side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.change-pill{display:inline-flex;align-items:center;justify-content:center;min-width:64px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.01em}
.change-pill.up{color:#ff7474;background:rgba(239,68,68,.14)}.change-pill.down{color:#3ad283;background:rgba(34,197,94,.12)}
.stock-price{font-size:13px;line-height:1;font-weight:500;letter-spacing:-.02em;color:var(--text-secondary)}
.remove-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:rgba(239,68,68,.12);color:#fca5a5;cursor:pointer;opacity:0;transition:opacity .15s ease,background .15s ease}
.stock-card:hover .remove-btn{opacity:1}
.remove-btn:hover{background:rgba(239,68,68,.22)}
.context-menu{position:fixed;z-index:40;width:132px;padding:6px;border:1px solid var(--border-color);border-radius:14px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.34);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px)}
.context-menu-item{width:100%;display:flex;align-items:center;height:34px;padding:0 10px;border:none;border-radius:10px;background:transparent;color:var(--text-primary);font-size:13px;text-align:left;cursor:pointer}
.context-menu-item:hover:not(:disabled){background:rgba(255,255,255,.06)}
.context-menu-item:disabled{color:var(--text-muted);cursor:not-allowed}
.empty-state{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);text-align:center}
.empty-state p{font-size:14px;font-weight:600;color:var(--text-secondary)}.empty-state span{font-size:12px}
</style>
