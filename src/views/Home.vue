<template>
  <div class="home-view">
    <!-- 大盘指数 -->
    <div v-if="settingsStore.settings.showIndices" class="indices-section">
      <div v-for="index in indices" :key="index.code" class="index-item">
        <div class="index-name">{{ index.name }}</div>
        <div class="index-price" :class="{ up: index.changePercent >= 0, down: index.changePercent < 0 }">
          {{ index.price.toFixed(2) }}
        </div>
        <div class="index-change-info">
          <span class="index-change" :class="{ up: index.changePercent >= 0, down: index.changePercent < 0 }">
            {{ index.change >= 0 ? '+' : '' }}{{ index.change.toFixed(3) }}
            {{ formatChange(index.changePercent) }}
          </span>
        </div>
        <svg v-if="index.sparkline.length > 0" class="sparkline-svg" viewBox="0 0 100 30" preserveAspectRatio="none">
          <polyline
            :points="getSparklinePoints(index.sparkline)"
            fill="none"
            :stroke="index.changePercent >= 0 ? 'var(--success)' : 'var(--danger)'"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
      </div>
    </div>

    <!-- 股票列表 -->
    <div class="stock-list">
      <div v-if="stockStore.stockList.length === 0" class="empty-state">
        <p>暂无自选股</p>
        <p class="hint">在下方搜索框添加股票</p>
      </div>
      <div
        v-for="stock in stockStore.stockList"
        :key="stock.code"
        class="stock-item"
        @click="handleItemClick(stock.code)"
        @contextmenu.prevent="showContextMenu(stock.code, $event)"
      >
        <div class="stock-info">
          <div class="stock-name">{{ stock.name }}</div>
          <div class="stock-code">{{ stock.code }}</div>
        </div>
        <!-- Sparkline 折线图 -->
        <svg v-if="settingsStore.settings.showSparklines && stockStore.getSparkline(stock.code)?.length" class="sparkline-svg stock-sparkline" :viewBox="`0 0 ${sparklineWidth} 30`" preserveAspectRatio="none">
          <line
            :x1="0" :x2="sparklineWidth"
            :y1="getReferenceY(stockStore.getSparkline(stock.code) || [])"
            :y2="getReferenceY(stockStore.getSparkline(stock.code) || [])"
            :stroke="stock.changePercent >= 0 ? 'var(--success)' : 'var(--danger)'"
            stroke-width="0.5"
            stroke-dasharray="4,2"
            opacity="0.4"
            vector-effect="non-scaling-stroke"
          />
          <polyline
            :points="getSparklinePoints(stockStore.getSparkline(stock.code) || [])"
            fill="none"
            :stroke="stock.changePercent >= 0 ? 'var(--success)' : 'var(--danger)'"
            stroke-width="1.5"
            stroke-linecap="round"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div class="stock-price">
          <div class="price">{{ stock.price.toFixed(2) }}</div>
          <div class="change" :class="{ up: stock.changePercent >= 0, down: stock.changePercent < 0 }">
            {{ formatChange(stock.changePercent) }}
          </div>
        </div>
        <button class="remove-btn" @click.stop="stockStore.removeStock(stock.code)" title="删除">×</button>
      </div>
    </div>

    <div class="footer-area">
      <div class="footer-bar">
        <div class="search-box">
          <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="搜索股票代码或名称"
            @input="handleSearch"
            @focus="showSearch = true"
            @blur="handleBlur"
          />
          <div v-if="showSearch && searchResults.length > 0" class="search-results">
            <div
              v-for="item in searchResults"
              :key="item.code"
              class="search-item"
              @mousedown.prevent="handleSelect(item.code)"
            >
              <span class="search-name">{{ item.name }}</span>
              <span class="search-code">{{ item.code }}</span>
            </div>
          </div>
        </div>
        <button class="refresh-btn" @click="handleRefresh" :class="{ spinning: stockStore.loading }">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"></polyline>
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
          </svg>
          <span>更新于 {{ stockStore.lastUpdate ? formatTime(stockStore.lastUpdate) : '--:--:--' }}</span>
        </button>
      </div>
    </div>
  </div>

  <!-- Context menu -->
  <div v-if="contextMenu.visible" class="context-menu" :style="{ top: contextMenu.y + 'px', left: contextMenu.x + 'px' }">
    <div
      v-if="stockStore.watchList.indexOf(contextMenu.code) > 0"
      class="context-item"
      @mousedown.prevent="moveStockTo(contextMenu.code, stockStore.watchList.indexOf(contextMenu.code) - 1)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
      上移
    </div>
    <div
      v-if="stockStore.watchList.indexOf(contextMenu.code) < stockStore.watchList.length - 1"
      class="context-item"
      @mousedown.prevent="moveStockTo(contextMenu.code, stockStore.watchList.indexOf(contextMenu.code) + 1)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      下移
    </div>
    <div v-if="stockStore.watchList.indexOf(contextMenu.code) > 0" class="context-divider"></div>
    <div
      v-if="stockStore.watchList.indexOf(contextMenu.code) > 0"
      class="context-item"
      @mousedown.prevent="moveStockTo(contextMenu.code, 0)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
      置顶
    </div>
    <div
      v-if="stockStore.watchList.indexOf(contextMenu.code) < stockStore.watchList.length - 1"
      class="context-item"
      @mousedown.prevent="moveStockTo(contextMenu.code, stockStore.watchList.length - 1)"
    >
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
      置底
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import { useStockStore } from '../stores/stock'
import { useSettingsStore } from '../stores/settings'
import { searchStock, fetchIndices, type IndexData } from '../api/stock'

const emit = defineEmits<{
  select: [code: string]
}>()

const stockStore = useStockStore()
const settingsStore = useSettingsStore()
const searchQuery = ref('')
const searchResults = ref<{ code: string; name: string; market: string }[]>([])
const showSearch = ref(false)
const sparklineWidth = ref(100)
const indices = ref<IndexData[]>([])
let searchTimer: ReturnType<typeof setTimeout> | null = null
let blurTimer: ReturnType<typeof setTimeout> | null = null

// Context menu state
const contextMenu = reactive({
  visible: false,
  code: '',
  x: 0,
  y: 0,
})

function moveStockTo(code: string, to: number) {
  const from = stockStore.watchList.indexOf(code)
  if (from < 0 || from === to) return
  const list = [...stockStore.watchList]
  list.splice(from, 1)
  const adjustedTo = Math.min(to, list.length)
  list.splice(adjustedTo, 0, code)
  stockStore.watchList = list
  localStorage.setItem('watchList', JSON.stringify(list))
  closeContextMenu()
}

function showContextMenu(code: string, e: MouseEvent) {
  const btn = (e.target as HTMLElement).closest('.remove-btn')
  if (btn) return

  e.stopPropagation()
  contextMenu.visible = true
  contextMenu.code = code
  contextMenu.x = e.clientX
  contextMenu.y = e.clientY
}

function closeContextMenu() {
  contextMenu.visible = false
  contextMenu.code = ''
}

function formatChange(percent: number): string {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

// SVG sparkline points generator
function getSparklinePoints(prices: number[]): string {
  if (prices.length < 2) return ''
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const w = sparklineWidth.value
  const h = 30
  const padding = 2
  const step = (w - padding * 2) / (prices.length - 1)

  return prices.map((p, i) => {
    const x = padding + i * step
    const y = padding + (1 - (p - min) / range) * (h - padding * 2)
    return `${x.toFixed(1)},${y.toFixed(1)}`
  }).join(' ')
}

// 计算0%参考线（昨收/首价）的Y坐标
function getReferenceY(prices: number[]): number {
  if (prices.length < 2) return 15
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const h = 30
  const padding = 2
  const ref = prices[0]
  return padding + (1 - (ref - min) / range) * (h - padding * 2)
}

async function handleSearch() {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(async () => {
    if (!searchQuery.value.trim()) {
      searchResults.value = []
      return
    }
    const results = await searchStock(searchQuery.value.trim())
    searchResults.value = results
    if (results.length > 0) {
      showSearch.value = true
    }
  }, 300)
}

function handleSelect(code: string) {
  // 清除blur定时器
  if (blurTimer) {
    clearTimeout(blurTimer)
    blurTimer = null
  }
  stockStore.addStock(code)
  searchQuery.value = ''
  searchResults.value = []
  showSearch.value = false
}

function handleBlur() {
  blurTimer = setTimeout(() => {
    showSearch.value = false
    searchResults.value = []
    blurTimer = null
  }, 200)
}

async function handleRefresh() {
  await stockStore.refreshStocks()
  await stockStore.fetchAllSparklines()
  indices.value = await fetchIndices()
}

async function loadIndices() {
  indices.value = await fetchIndices()
}

function handleItemClick(code: string) {
  emit('select', code)
}

let autoRefreshTimer: number | null = null
let sparklineResizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await loadIndices()
  await stockStore.fetchAllSparklines()

  // Measure sparkline container width for dynamic viewBox
  function updateSparklineWidth() {
    const el = document.querySelector('.stock-sparkline') as HTMLElement
    if (el) {
      sparklineWidth.value = Math.round(el.getBoundingClientRect().width)
    }
  }
  updateSparklineWidth()
  const listEl = document.querySelector('.stock-list') as HTMLElement
  if (listEl) {
    sparklineResizeObserver = new ResizeObserver(() => updateSparklineWidth())
    sparklineResizeObserver.observe(listEl)
  }

  // Close context menu on global click
  window.addEventListener('click', closeContextMenu)

  // Auto-refresh indices and sparklines every 30s
  autoRefreshTimer = window.setInterval(async () => {
    await loadIndices()
    await stockStore.fetchAllSparklines()
  }, 30000)
})

onUnmounted(() => {
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
  if (sparklineResizeObserver) {
    sparklineResizeObserver.disconnect()
  }
  window.removeEventListener('click', closeContextMenu)
})
</script>

<style scoped>
.home-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* 大盘指数区域 */
.indices-section {
  display: flex;
  justify-content: space-around;
  padding: 0 16px 2px;
  border-bottom: 1px solid var(--divider-color);
  flex-shrink: 0;
}

.index-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  flex: 1;
}

.index-name {
  font-size: 11px;
  color: var(--text-muted);
}

.index-price {
  font-size: 16px;
  font-weight: 600;
}

.index-price.up {
  color: var(--success);
}

.index-price.down {
  color: var(--danger);
}

.index-change-info {
  font-size: 10px;
}

.index-change.up {
  color: var(--success);
}

.index-change.down {
  color: var(--danger);
}

/* Sparkline SVG */
.sparkline-svg {
  width: 100%;
  height: 20px;
  flex-shrink: 0;
}

.stock-sparkline {
  flex: 1;
  height: 24px;
  margin: 0 8px;
  min-width: 0;
  align-self: center;
}

.stock-list {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 0 8px;
}

.stock-list::-webkit-scrollbar {
  display: none;
}

.stock-list {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  color: var(--text-muted);
}

.empty-state p {
  margin: 0;
}

.empty-state .hint {
  margin-top: 8px;
  font-size: 12px;
}

.stock-item {
  display: flex;
  align-items: center;
  padding: 12px 8px;
  border-radius: var(--radius);
  cursor: pointer;
  transition: background 0.15s;
}

.stock-item:hover {
  background: var(--card-bg-hover);
}

.stock-info {
  flex: 0 0 auto;
  min-width: 0;
  margin-right: 8px;
}

.stock-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-code {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.stock-price {
  text-align: right;
  margin-left: auto;
  flex-shrink: 0;
}

.price {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.change {
  font-size: 12px;
  margin-top: 2px;
}

.change.up {
  color: var(--success);
}

.change.down {
  color: var(--danger);
}

.remove-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stock-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  color: var(--danger);
}

/* Footer area */
.footer-area {
  padding: 8px 16px 12px;
  flex-shrink: 0;
}

.footer-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  flex: 1;
  position: relative;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--text-muted);
  pointer-events: none;
}

.search-box input {
  width: 100%;
  padding: 8px 12px 8px 36px;
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
  transition: border-color 0.15s;
}

.search-box input::placeholder {
  color: var(--text-muted);
}

.search-box input:focus {
  border-color: var(--accent);
}

.search-results {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: var(--window-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  max-height: 160px;
  overflow-y: auto;
  z-index: 10;
}

.search-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.search-item:hover {
  background: var(--card-bg-hover);
}

.search-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.search-code {
  font-size: 12px;
  color: var(--text-muted);
}

/* Refresh button */
.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.15s;
}

.refresh-btn:hover {
  color: var(--text-primary);
}

.refresh-btn.spinning svg {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Context menu */
.context-menu {
  position: fixed;
  min-width: 100px;
  background: var(--window-bg);
  border: 1px solid var(--border-color);
  border-radius: var(--radius);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  padding: 4px 0;
}

.context-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  font-size: 13px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.1s;
}

.context-item:hover {
  background: var(--card-bg-hover);
}

.context-divider {
  height: 1px;
  margin: 4px 8px;
  background: var(--border-color);
}
</style>
