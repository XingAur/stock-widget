<template>
  <div class="market-view">
    <div class="cl-segmented cl-segmented--block market-tabs" role="group" aria-label="市场">
      <button
        v-for="group in MARKET_GROUPS"
        :key="group.key"
        class="cl-segmented__item market-tab"
        :class="{ 'is-active': activeMarket === group.key }"
        :aria-pressed="activeMarket === group.key"
        type="button"
        @click="switchMarket(group.key)"
      >
        {{ group.label }}
      </button>
    </div>

    <div class="market-status-line">
      <span class="cl-badge market-status" :class="{ 'cl-badge--success open': isMarketOpen }" role="status">
        <span class="cl-dot" :class="{ 'cl-dot--live': isMarketOpen }"></span>{{ statusText }}
      </span>
      <div v-if="modeOptions.length > 0" class="cl-segmented cl-segmented--sm market-mode-switch" role="group" aria-label="板块/指数切换">
        <button
          v-for="option in modeOptions"
          :key="option.mode"
          class="cl-segmented__item market-mode-btn"
          :class="{ 'is-active': viewMode === option.mode }"
          :aria-pressed="viewMode === option.mode"
          type="button"
          @click="switchView(option.mode)"
        >
          {{ option.label }}
        </button>
      </div>
      <span v-if="error" class="cl-badge cl-badge--danger market-error" :title="error">刷新失败</span>
    </div>

    <div class="market-grid-wrap">
      <p v-if="error" class="cl-hint market-retry" role="status">
        {{ cards.length ? '当前显示上次成功获取的数据。' : '' }}{{ retryText }}
      </p>
      <div v-if="cards.length === 0" class="cl-empty market-empty">
        <p class="cl-empty__title">{{ error ? '行情刷新失败' : loading ? '加载中...' : '暂无行情数据' }}</p>
        <span v-if="error" class="cl-empty__desc">{{ error }}</span>
      </div>

      <div v-else class="cl-stat-grid market-grid">
        <div
          v-for="card in cards"
          :key="card.code"
          class="cl-stat cl-stat--md market-card"
          :class="{ up: card.up, down: card.down }"
        >
          <div class="cl-stat__label market-card-name" :title="card.name">{{ card.name }}</div>
          <div class="cl-stat__value market-card-percent" :class="{ 'cl-rise': card.up, 'cl-fall': card.down }">
            <span class="cl-stat__arrow market-arrow">{{ card.up ? '▲' : card.down ? '▼' : '' }}</span>{{ card.percentText }}
          </div>
          <div v-if="card.memberText" class="cl-stat__delta market-card-members">
            <span class="cl-rise gain">{{ card.memberText.split(' · ')[0] }}</span>
            <span class="cl-fall lose">{{ card.memberText.split(' · ')[1] }}</span>
          </div>
          <div v-else class="cl-stat__delta market-card-price">
            <span class="cl-secondary">{{ card.priceText }}</span>
            <span class="market-card-change" :class="{ 'cl-rise': card.up, 'cl-fall': card.down }">{{ card.changeText }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="cl-statusbar market-bottom">
      <button
        class="cl-iconbtn cl-iconbtn--accent is-active market-globe-btn"
        type="button"
        title="返回自选"
        @click="goBackToWatchlist"
      >
        <Globe aria-hidden="true" />
      </button>
      <span class="cl-spacer"></span>
      <div class="cl-statusbar__actions market-bottom-actions">
        <button class="cl-iconbtn refresh-btn" type="button" title="刷新" :disabled="loading" @click="refreshNow">
          <RotateCw aria-hidden="true" />
        </button>
        <span class="cl-statusbar__time update-time">{{ lastUpdate ? formatTime(lastUpdate) : '--:--:--' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Globe, RotateCw } from 'lucide-vue-next'
import { fetchGlobalIndices, type GlobalIndexData, type MarketKey } from '../api/stock'
import { useStockStore } from '../stores/stock'
import {
  MARKET_GROUPS,
  dataKeyForView,
  defaultViewMode,
  findMarketGroup,
  isOpenMarket,
  lastWatchlistViewType,
  marketViewModeOptions,
  toMarketCardModel,
  type MarketViewMode
} from '../utils/market'
import { readPersistedSlice, updatePersistedSlice } from '../utils/persistence'
import { logError } from '../utils/logger'
import { marketErrorMessage, marketRefreshDelay, readMarketSnapshot, saveMarketSnapshot } from '../utils/marketRefresh'

const stockStore = useStockStore()

const activeMarket = ref<MarketKey>('cn')
const viewMode = ref<MarketViewMode>('industry')
const indices = ref<GlobalIndexData[]>([])
const loading = ref(false)
const error = ref('')
const lastUpdate = ref<Date | null>(null)
const failures = ref(0)
const retryText = computed(() => {
  if (loading.value) return '正在重试…'
  const delay = marketRefreshDelay(failures.value, false)
  return delay === null ? '自动重试已暂停，请点击刷新重试；详情见托盘运行日志。' : `将在 ${delay / 1000} 秒后自动重试。`
})

let refreshTimer: number | null = null
let loadSeq = 0
let requestKey: MarketKey | null = null

const activeGroup = computed(() => findMarketGroup(activeMarket.value))
const modeOptions = computed(() => marketViewModeOptions(activeGroup.value.hasSectors, activeMarket.value === 'cn'))
const cards = computed(() => indices.value.map(toMarketCardModel))
const isMarketOpen = computed(() => !error.value && isOpenMarket(indices.value))
const statusText = computed(() => (
  error.value || indices.value.length === 0
    ? `${activeGroup.value.label}状态未知`
    : isMarketOpen.value ? `${activeGroup.value.label}盘中` : `${activeGroup.value.label}已休市`
))

/** 当前视图实际请求的行情 key：默认行业板块（主流做法），可切概念/指数 */
const currentDataKey = computed<MarketKey>(() => dataKeyForView(activeMarket.value, viewMode.value))

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

async function load(): Promise<void> {
  const key = currentDataKey.value
  if (loading.value && requestKey === key) return
  clearRefreshTimer()
  const seq = ++loadSeq
  requestKey = key
  loading.value = true
  try {
    const data = await fetchGlobalIndices(key)
    if (seq !== loadSeq || key !== currentDataKey.value) {
      return
    }
    if (data.length === 0) {
      throw new Error('行情服务未返回数据')
    }

    indices.value = data
    error.value = ''
    lastUpdate.value = new Date()
    failures.value = 0
    saveMarketSnapshot(key, data, lastUpdate.value)
  } catch (caught) {
    if (seq !== loadSeq) {
      return
    }
    failures.value += 1
    error.value = marketErrorMessage(key, caught)
    logError(`市场行情刷新失败（${key}，连续失败 ${failures.value} 次）`, caught)
  } finally {
    if (seq === loadSeq) {
      loading.value = false
      const delay = marketRefreshDelay(failures.value, isOpenMarket(indices.value))
      if (delay !== null) refreshTimer = window.setTimeout(() => { void load() }, delay)
    }
  }
}

function clearRefreshTimer(): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer)
  refreshTimer = null
}

function restoreSnapshot(): void {
  clearRefreshTimer()
  const snapshot = readMarketSnapshot(currentDataKey.value)
  indices.value = snapshot?.data ?? []
  lastUpdate.value = snapshot?.updatedAt ?? null
  error.value = ''
  failures.value = 0
}

function switchMarket(market: MarketKey): void {
  if (activeMarket.value === market) {
    return
  }

  activeMarket.value = market
  // 进入新市场回到默认视图：默认行业板块（主流做法），纯指数市场只有指数
  viewMode.value = findMarketGroup(market).hasSectors ? 'industry' : 'indices'
  restoreSnapshot()
  updatePersistedSlice('activeMarket', market)
  void load()
}

function switchView(mode: MarketViewMode): void {
  if (viewMode.value === mode) {
    return
  }

  viewMode.value = mode
  restoreSnapshot()
  void load()
}

function refreshNow(): void {
  if (loading.value) return
  failures.value = 0
  void load()
}

function goBackToWatchlist(): void {
  stockStore.setActiveAssetType(lastWatchlistViewType())
}

watch(() => stockStore.activeAssetType, (next) => {
  // 从市场页切走时停止轮询由 onUnmounted 负责；切回时立即拉一次最新数据
  if (next === 'market' && indices.value.length === 0) {
    void load()
  }
})

onMounted(() => {
  const rememberedMarket = readPersistedSlice('activeMarket')
  if (typeof rememberedMarket === 'string') {
    activeMarket.value = findMarketGroup(rememberedMarket).key
  }
  viewMode.value = defaultViewMode(activeMarket.value)
  restoreSnapshot()
  void load()
})

onUnmounted(() => {
  loadSeq += 1
  clearRefreshTimer()
})
</script>

<style scoped>
.market-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0}
.market-tabs{margin:0 10px 6px}
.market-status-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 10px 8px}
.market-status{height:22px;padding:0 10px;border-radius:var(--radius-pill);font-size:var(--fs-xs);font-weight:600}
.market-error{min-width:0;overflow:hidden;text-overflow:ellipsis}
.market-grid-wrap{flex:1;min-height:0;overflow-y:auto;padding:0 10px}
.market-grid{--cols:2;padding-bottom:6px}
.market-card-members span{opacity:.8}
.market-card-change{opacity:.8}
.market-empty{height:100%}
.market-retry{margin:4px 0 8px;overflow-wrap:anywhere}
@media (max-width:230px){
  .market-grid{--cols:1}
  .market-status-line{flex-wrap:wrap}
}
</style>
