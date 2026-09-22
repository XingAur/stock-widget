<template>
  <div class="market-view">
    <div class="market-tabs">
      <button
        v-for="group in MARKET_GROUPS"
        :key="group.key"
        class="market-tab"
        :class="{ active: activeMarket === group.key }"
        type="button"
        @click="switchMarket(group.key)"
      >
        {{ group.label }}
      </button>
    </div>

    <div class="market-status-line">
      <span class="market-status" :class="{ open: isMarketOpen }" role="status">
        <i></i>{{ statusText }}
      </span>
      <div v-if="activeGroup.hasSectors" class="market-mode-switch" role="group" aria-label="板块/指数切换">
        <button
          class="market-mode-btn"
          :class="{ active: viewMode === 'sectors' }"
          type="button"
          @click="switchView('sectors')"
        >
          板块
        </button>
        <button
          class="market-mode-btn"
          :class="{ active: viewMode === 'indices' }"
          type="button"
          @click="switchView('indices')"
        >
          指数
        </button>
      </div>
      <span v-if="error" class="market-error" :title="error">刷新失败</span>
    </div>

    <div class="market-grid-wrap">
      <div v-if="cards.length === 0" class="market-empty">
        <p>{{ error ? '行情刷新失败' : loading ? '加载中...' : '暂无行情数据' }}</p>
        <span v-if="error">{{ error }}</span>
      </div>

      <div v-else class="market-grid">
        <div
          v-for="card in cards"
          :key="card.code"
          class="market-card"
          :class="{ up: card.up, down: card.down }"
        >
          <div class="market-card-name" :title="card.name">{{ card.name }}</div>
          <div class="market-card-percent">
            <span class="market-arrow">{{ card.up ? '▲' : card.down ? '▼' : '' }}</span>{{ card.percentText }}
          </div>
          <div v-if="card.memberText" class="market-card-members">
            <span class="gain">{{ card.memberText.split(' · ')[0] }}</span>
            <span class="lose">{{ card.memberText.split(' · ')[1] }}</span>
          </div>
          <div v-else class="market-card-price">{{ card.priceText }}<span class="market-card-change">{{ card.changeText }}</span></div>
        </div>
      </div>
    </div>

    <div class="market-bottom">
      <button
        class="market-globe-btn active"
        type="button"
        title="返回自选"
        @click="goBackToWatchlist"
      >
        <Globe :size="14" aria-hidden="true" />
      </button>
      <div class="market-bottom-actions">
        <button class="refresh-btn" type="button" title="刷新" @click="refreshNow">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <span class="update-time">{{ lastUpdate ? formatTime(lastUpdate) : '--:--:--' }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Globe } from 'lucide-vue-next'
import { fetchGlobalIndices, type GlobalIndexData, type MarketKey } from '../api/stock'
import { useStockStore } from '../stores/stock'
import {
  MARKET_GROUPS,
  findMarketGroup,
  isOpenMarket,
  lastWatchlistViewType,
  sectorDataKey,
  toMarketCardModel
} from '../utils/market'
import { readPersistedSlice, updatePersistedSlice } from '../utils/persistence'

/** 开市时每 60 秒刷新；休市时行情时间不再前进，自动停止轮询 */
const REFRESH_INTERVAL_MS = 60_000

const stockStore = useStockStore()

type MarketViewMode = 'sectors' | 'indices'

const activeMarket = ref<MarketKey>('cn')
const viewMode = ref<MarketViewMode>('sectors')
const indices = ref<GlobalIndexData[]>([])
const loading = ref(false)
const error = ref('')
const lastUpdate = ref<Date | null>(null)

let refreshTimer: number | null = null

const activeGroup = computed(() => findMarketGroup(activeMarket.value))
const cards = computed(() => indices.value.map(toMarketCardModel))
const isMarketOpen = computed(() => isOpenMarket(indices.value))
const statusText = computed(() => (
  isMarketOpen.value ? `${activeGroup.value.label}盘中` : `${activeGroup.value.label}已休市`
))

/** 当前视图实际请求的行情 key：有板块的市场默认板块，切到指数后拉指数 */
const currentDataKey = computed<MarketKey>(() => (
  viewMode.value === 'sectors' && activeGroup.value.hasSectors
    ? sectorDataKey(activeMarket.value)
    : activeMarket.value
))

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

async function load(): Promise<void> {
  if (loading.value) {
    return
  }

  loading.value = true
  try {
    const data = await fetchGlobalIndices(currentDataKey.value)
    if (data.length === 0) {
      if (indices.value.length === 0) {
        error.value = '行情服务暂未返回数据'
      }
      return
    }

    indices.value = data
    error.value = ''
    lastUpdate.value = new Date()
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    loading.value = false
  }
}

function switchMarket(market: MarketKey): void {
  if (activeMarket.value === market) {
    return
  }

  activeMarket.value = market
  // 进入新市场回到默认视图：有板块先看板块，纯指数市场只有指数
  viewMode.value = findMarketGroup(market).hasSectors ? 'sectors' : 'indices'
  indices.value = []
  error.value = ''
  lastUpdate.value = null
  updatePersistedSlice('activeMarket', market)
  void load()
}

function switchView(mode: MarketViewMode): void {
  if (viewMode.value === mode || loading.value) {
    return
  }

  viewMode.value = mode
  indices.value = []
  error.value = ''
  lastUpdate.value = null
  void load()
}

function refreshNow(): void {
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

  void load()
  refreshTimer = window.setInterval(() => {
    if (isOpenMarket(indices.value)) {
      void load()
    }
  }, REFRESH_INTERVAL_MS)
})

onUnmounted(() => {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style scoped>
.market-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0}
.market-tabs{display:flex;align-items:center;gap:4px;margin:0 10px 6px;padding:3px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.035)}
.market-tab{flex:1;height:24px;border:none;border-radius:7px;background:transparent;color:var(--text-muted);font-size:12px;font-weight:700;cursor:pointer;transition:background .15s ease,color .15s ease}
.market-tab:hover{color:var(--text-primary);background:rgba(255,255,255,.045)}
.market-tab.active{color:#f8fbff;background:rgba(45,124,246,.72);box-shadow:inset 0 1px 0 rgba(255,255,255,.16)}
.market-status-line{display:flex;align-items:center;justify-content:space-between;gap:8px;margin:0 10px 8px}
.market-status{display:inline-flex;align-items:center;gap:6px;height:22px;padding:0 10px;border:1px solid rgba(255,255,255,.1);border-radius:999px;background:rgba(255,255,255,.04);color:var(--text-muted);font-size:11px;font-weight:600;white-space:nowrap}
.market-status i{width:7px;height:7px;border-radius:50%;background:#7b8497;flex:0 0 auto}
.market-status.open{border-color:rgba(56,199,122,.32);background:rgba(56,199,122,.1);color:#4ade80}
.market-status.open i{background:#2fbd6f;box-shadow:0 0 6px rgba(47,189,111,.8)}
.market-mode-switch{display:inline-flex;align-items:center;padding:2px;border:1px solid rgba(255,255,255,.1);border-radius:8px;background:rgba(255,255,255,.035)}
.market-mode-btn{height:18px;padding:0 8px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);font-size:10px;font-weight:700;cursor:pointer;transition:color .15s ease,background .15s ease}
.market-mode-btn:hover{color:var(--text-primary)}
.market-mode-btn.active{color:#f8fbff;background:rgba(45,124,246,.72)}
.market-error{color:#ff8c8c;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.market-grid-wrap{flex:1;min-height:0;overflow-y:auto;padding:0 10px}
.market-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px;padding-bottom:6px}
.market-card{display:flex;flex-direction:column;gap:4px;min-width:0;padding:9px 10px;border:1px solid rgba(255,255,255,.07);border-radius:10px;background:rgba(255,255,255,.03)}
.market-card-name{font-size:12px;font-weight:700;line-height:1.1;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.market-card-percent{display:flex;align-items:baseline;gap:3px;font-size:17px;font-weight:900;line-height:1.1;font-variant-numeric:tabular-nums}
.market-arrow{font-size:10px;transform:translateY(-1px)}
.market-card.up .market-card-percent{color:#ff7474}
.market-card.down .market-card-percent{color:#3ad283}
.market-card:not(.up):not(.down) .market-card-percent{color:var(--text-secondary)}
.market-card-price{font-size:11px;line-height:1;color:var(--text-secondary);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.market-card-members{display:flex;align-items:center;gap:6px;font-size:10px;line-height:1;font-variant-numeric:tabular-nums}
.market-card-members .gain{color:rgba(255,116,116,.78)}
.market-card-members .lose{color:rgba(58,210,131,.78)}
.market-card-change{margin-left:6px;color:var(--text-muted)}
.market-card.up .market-card-change{color:rgba(255,116,116,.75)}
.market-card.down .market-card-change{color:rgba(58,210,131,.75)}
.market-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);text-align:center;padding:12px}
.market-empty p{font-size:14px;font-weight:600;color:var(--text-secondary)}
.market-empty span{font-size:12px;max-width:100%;overflow:hidden;text-overflow:ellipsis}
.market-bottom{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:4px 10px 6px}
.market-globe-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.market-globe-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}
.market-globe-btn.active{color:#5da8ff;background:rgba(45,124,246,.16)}
.market-bottom-actions{display:inline-flex;align-items:center;gap:6px}
.refresh-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer;transition:color .15s ease,background .15s ease}
.refresh-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}
.update-time{font-size:11px;color:var(--text-muted)}
</style>
