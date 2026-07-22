<template>
  <div class="fund-detail-view">
    <div v-if="loading && !quote && history.length === 0" class="fund-detail-loading">
      <span class="loading-orbit" />
      <span>基金详情加载中 · {{ code }}</span>
      <button type="button" aria-label="关闭基金详情" title="关闭" @click="emit('close')"><X :size="16" aria-hidden="true" /></button>
    </div>

    <template v-else>
      <header class="fund-header">
        <div class="identity-block">
          <button class="close-btn" type="button" aria-label="返回基金列表" title="关闭详情" @click="emit('close')"><ArrowLeft :size="16" aria-hidden="true" /></button>
          <div class="fund-identity">
            <div class="identity-line">
              <h2>{{ fundName }}</h2>
              <span class="code-chip">{{ code }}</span>
            </div>
            <div class="fund-tags">
              <span>{{ profile?.fundType || '基金' }}</span>
              <span>{{ profile?.riskLevel || '风险等级待更新' }}</span>
              <span v-if="updatedAt">更新 {{ updatedAt }}</span>
            </div>
          </div>
        </div>

        <div class="nav-block">
          <span class="nav-source" :class="{ estimate: isEstimate }">{{ isEstimate ? '持仓估算' : '已确认净值' }}</span>
          <div class="nav-line">
            <strong>{{ formatNav(displayNav) }}</strong>
            <span :class="profitClass(dayChange)">{{ formatPercent(dayChange, true) }}</span>
          </div>
          <small>{{ displayDate || '--' }}</small>
        </div>

        <div class="remote-metrics">
          <div><span>近一年</span><strong :class="profitClass(oneYearReturn)">{{ formatPercent(oneYearReturn, true) }}</strong></div>
          <div><span>同类排名</span><strong>{{ rankText }}</strong></div>
          <div><span>持仓占比</span><strong>{{ formatPercent(position?.positionPercent) }}</strong></div>
        </div>
      </header>

      <div v-if="pageError" class="page-notice">{{ pageError }}</div>

      <main class="fund-main">
        <section class="visual-panel">
          <nav class="fund-tabs" aria-label="基金详情页签">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              type="button"
              :class="{ active: activeTab === tab.value }"
              @click="activeTab = tab.value"
            >{{ tab.label }}</button>
          </nav>

          <div class="tab-content">
            <FundRelatedHoldings
              v-if="activeTab === 'related'"
              :allocation="allocation"
              :loading="loading"
              :error="sectionErrors.allocation"
            />
            <FundPerformanceChart
              v-else-if="activeTab === 'performance'"
              :model="performanceModel"
              :history="history"
              :range="performanceRange"
              :loading="loading && history.length === 0"
              :error="sectionErrors.performance"
              :cost-return="costReturn"
              @update:range="performanceRange = $event"
            />
            <FundIncomeChart
              v-else
              :snapshots="ledger?.snapshots || []"
              :range="incomeRange"
              :current-total-profit="position?.totalProfit || 0"
              :loading="loading && !ledger"
              :error="sectionErrors.income"
              @update:range="incomeRange = $event"
            />
          </div>
        </section>

        <aside class="position-panel">
          <div class="position-title">
            <div><span class="eyebrow">MY POSITION</span><h3>持仓摘要</h3></div>
            <button type="button" @click="handleAction('records', $event)">收益明细 <ChevronRight :size="12" aria-hidden="true" /></button>
          </div>

          <template v-if="position">
            <div class="hero-position">
              <span>持有金额</span>
              <strong>{{ formatMoney(position.currentValue) }}</strong>
              <small>{{ position.shares.toLocaleString('zh-CN', { maximumFractionDigits: 2 }) }} 份</small>
            </div>
            <div class="position-grid">
              <div><span>持有收益</span><strong :class="profitClass(position.holdingProfit)">{{ formatMoney(position.holdingProfit, true) }}</strong></div>
              <div><span>收益率</span><strong :class="profitClass(position.holdingProfitPercent)">{{ formatPercent(position.holdingProfitPercent, true) }}</strong></div>
              <div><span>昨日收益</span><strong :class="profitClass(yesterdayProfit)">{{ yesterdayProfit === null ? '--' : formatMoney(yesterdayProfit, true) }}</strong></div>
              <div><span>持仓成本</span><strong>{{ position.costNav?.toFixed(4) || '--' }}</strong></div>
              <div><span>持有天数</span><strong>{{ position.holdingDays }} 天</strong></div>
              <div><span>已实现</span><strong :class="profitClass(position.realizedProfit)">{{ formatMoney(position.realizedProfit, true) }}</strong></div>
            </div>
          </template>
          <div v-else class="no-position">
            <span class="empty-ring">¥</span>
            <strong>尚未记录持仓</strong>
            <p>点击“加仓”或“修改持仓”建立本地账本</p>
          </div>

          <div class="data-footnote">
            <i :class="{ live: isEstimate }" />
            {{ isEstimate ? '持仓估算仅用于当前展示，不写入收益' : '收益按官方净值更新' }}
          </div>
        </aside>
      </main>

      <footer class="fund-actions">
        <button
          v-for="action in actions"
          :key="action.value"
          type="button"
          :aria-label="action.label"
          @click="handleAction(action.value, $event)"
        >
          <component :is="action.icon" class="fund-action-icon" :size="17" :stroke-width="1.8" aria-hidden="true" />
          <small>{{ action.label }}</small>
        </button>
        <div v-if="showMore" class="more-menu">
          <button type="button" @click="void loadFundDetail(true)">刷新数据</button>
          <button type="button" class="danger" @click="clearPosition">删除持仓</button>
        </div>
      </footer>

      <div
        v-if="activeAction"
        ref="actionOverlayRef"
        class="action-overlay"
        tabindex="-1"
        @click.self="closeAction"
        @keydown="handleActionOverlayKeydown"
      >
        <FundTransactionList
          v-if="activeAction === 'records'"
          :ledger="ledger"
          :fund-name="fundName"
          :code="code"
          @close="closeAction"
          @edit="editTransaction"
          @delete="deleteTransaction"
        />
        <FundPositionDialog
          v-else
          :mode="dialogMode"
          :code="code"
          :fund-name="fundName"
          :history="transactionHistory"
          :current-nav="officialNav"
          :available-shares="dialogAvailableShares"
          :average-cost-nav="position?.costNav || null"
          :current-holding-amount="position?.currentValue || 0"
          :current-holding-profit="position?.holdingProfit || 0"
          :initial-transaction="editingTransaction"
          :minimum-trade-date="ledger?.baseline.date || ''"
          @close="closeAction"
          @submit="saveTransaction"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch, type Component } from 'vue'
import { ArrowLeft, ChevronRight, Ellipsis, History, Minus, Pencil, Plus, X } from 'lucide-vue-next'
import {
  fetchFundAllocation,
  fetchFundHistory,
  fetchFundProfile,
  fetchFunds,
  fetchIndexHistory,
  type FundAllocation,
  type FundNavPoint,
  type FundProfile,
  type FundQuote,
  type KlinePoint
} from '../api/stock'
import { useStockStore } from '../stores/stock'
import { calculateFundRangeReturn, createPerformanceSeries, type FundChartRange } from '../utils/fundChart'
import { readFundDetailCache, shouldRefreshFundHistory, writeFundDetailCache } from '../utils/fundCache'
import { localDateKey, resolveFundDisplayQuote } from '../utils/fundQuote'
import { deriveFundPosition, type FundPositionView, type FundTransaction, type FundTransactionInput } from '../utils/fundLedger'
import { focusFirstModalControl, trapModalFocus } from '../utils/modalFocus'
import FundIncomeChart from '../components/fund/FundIncomeChart.vue'
import FundPerformanceChart from '../components/fund/FundPerformanceChart.vue'
import FundRelatedHoldings from '../components/fund/FundRelatedHoldings.vue'
import FundPositionDialog from '../components/fund/FundPositionDialog.vue'
import FundTransactionList from '../components/fund/FundTransactionList.vue'

const props = defineProps<{ code: string }>()
const emit = defineEmits<{ close: [] }>()
const stockStore = useStockStore()

type FundTab = 'related' | 'performance' | 'income'
type FundAction = 'buy' | 'sell' | 'records' | 'adjust' | 'more'

const HISTORY_CACHE_TTL = 6 * 60 * 60 * 1000
const HISTORY_CACHE_SCOPE = 'history-v2'
const PROFILE_CACHE_TTL = 6 * 60 * 60 * 1000
const PROFILE_CACHE_SCOPE = 'profile-v2'
const ALLOCATION_CACHE_TTL = 24 * 60 * 60 * 1000
const ALLOCATION_CACHE_SCOPE = 'allocation-v2'
const BENCHMARK_CACHE_TTL = 6 * 60 * 60 * 1000

const tabs: Array<{ value: FundTab; label: string }> = [
  { value: 'related', label: '关联板块' },
  { value: 'performance', label: '业绩走势' },
  { value: 'income', label: '我的收益' }
]
const actions: Array<{ value: FundAction; label: string; icon: Component }> = [
  { value: 'buy', label: '加仓', icon: Plus },
  { value: 'sell', label: '减仓', icon: Minus },
  { value: 'records', label: '交易记录', icon: History },
  { value: 'adjust', label: '修改持仓', icon: Pencil },
  { value: 'more', label: '更多', icon: Ellipsis }
]

const quote = ref<FundQuote | null>(null)
const history = ref<FundNavPoint[]>([])
const profile = ref<FundProfile | null>(null)
const allocation = ref<FundAllocation | null>(null)
const benchmark = ref<KlinePoint[]>([])
const loading = ref(false)
const pageError = ref('')
const sectionErrors = ref({ allocation: '', performance: '', income: '' })
const updatedAt = ref('')
const activeTab = ref<FundTab>('performance')
const performanceRange = ref<FundChartRange>('3m')
const incomeRange = ref<FundChartRange>('3m')
const activeAction = ref<Exclude<FundAction, 'more'> | null>(null)
const editingTransaction = ref<FundTransaction | null>(null)
const showMore = ref(false)
const actionOverlayRef = ref<HTMLElement | null>(null)
let requestVersion = 0
let actionTrigger: HTMLElement | null = null

const ledger = computed(() => stockStore.fundLedgers[props.code] ?? null)
const latestHistory = computed(() => history.value[history.value.length - 1] ?? null)
const officialNavDate = computed(() => {
  const historyDate = latestHistory.value?.date ?? ''
  if (quote.value?.nav && quote.value.navDate >= historyDate) return quote.value.navDate
  return historyDate || quote.value?.navDate || ''
})
const officialNav = computed(() => quote.value?.nav && quote.value.navDate === officialNavDate.value
  ? quote.value.nav
  : latestHistory.value?.nav ?? quote.value?.nav ?? null)
const transactionHistory = computed(() => {
  const points = history.value.map((point) => ({ ...point }))
  if (quote.value?.nav && quote.value.navDate && !points.some((point) => point.date === quote.value?.navDate)) {
    points.push({
      date: quote.value.navDate,
      nav: quote.value.nav,
      accumulatedNav: quote.value.nav,
      changePercent: null
    })
  }
  return points.sort((left, right) => left.date.localeCompare(right.date))
})
const displayQuote = computed(() => quote.value ? resolveFundDisplayQuote(quote.value) : null)
const isEstimate = computed(() => displayQuote.value?.source === 'estimate')
const displayNav = computed(() => isEstimate.value ? displayQuote.value?.nav ?? null : officialNav.value)
const displayDate = computed(() => isEstimate.value
  ? displayQuote.value?.time || ''
  : officialNavDate.value)
const dayChange = computed(() => isEstimate.value
  ? displayQuote.value?.changePercent ?? null
  : quote.value?.navDate === officialNavDate.value
    ? quote.value?.changePercent ?? latestHistory.value?.changePercent ?? null
    : latestHistory.value?.changePercent ?? quote.value?.changePercent ?? null)
const fundName = computed(() => quote.value?.name || stockStore.fundNames[props.code] || `基金 ${props.code}`)
const rankText = computed(() => profile.value?.rank
  ? `${profile.value.rank.current}/${profile.value.rank.total}`
  : '--')
const oneYearReturn = computed(() => profile.value?.oneYearReturn
  ?? calculateFundRangeReturn(history.value, '1y'))

const accountMarketValue = computed(() => Object.entries(stockStore.fundLedgers).reduce((total, [code, item]) => {
  const fundQuote = stockStore.getFund(code)
  const resolvedFundQuote = fundQuote ? resolveFundDisplayQuote(fundQuote) : null
  const lastSnapshot = item.snapshots[item.snapshots.length - 1]
  const nav = code === props.code
    ? displayNav.value
    : resolvedFundQuote?.nav
      || lastSnapshot?.officialNav
      || item.baseline.nav
  if (!nav || !Number.isFinite(nav) || nav <= 0) return total
  try {
    return total + deriveFundPosition(item, nav).currentValue
  } catch {
    return total
  }
}, 0))

const position = computed<FundPositionView | null>(() => {
  if (!ledger.value || !displayNav.value || displayNav.value <= 0) return null
  try {
    return deriveFundPosition(ledger.value, displayNav.value, accountMarketValue.value, today())
  } catch (error) {
    sectionErrors.value.income = errorMessage(error)
    return null
  }
})
const performanceModel = computed(() => createPerformanceSeries(
  history.value,
  benchmark.value.map((point) => ({ date: point.time.slice(0, 10), value: point.close })),
  performanceRange.value
))
const costReturn = computed(() => {
  const costNav = position.value?.costNav
  if (!costNav || !displayNav.value) return null
  return Number(((displayNav.value / costNav - 1) * 100).toFixed(2))
})
const yesterdayProfit = computed(() => {
  const snapshots = ledger.value?.snapshots ?? []
  return snapshots[snapshots.length - 1]?.dailyProfit ?? null
})
const dialogMode = computed<'buy' | 'sell' | 'adjust'>(() => {
  if (editingTransaction.value?.type === 'buy') return 'buy'
  if (editingTransaction.value?.type === 'sell') return 'sell'
  return activeAction.value === 'sell' ? 'sell' : activeAction.value === 'adjust' ? 'adjust' : 'buy'
})
const dialogAvailableShares = computed(() => (position.value?.shares ?? 0)
  + (editingTransaction.value?.type === 'sell' ? editingTransaction.value.shares : 0))

function today(): string {
  return localDateKey(new Date())
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || '数据加载失败')
}

async function loadFundDetail(force = false): Promise<void> {
  const version = ++requestVersion
  const now = Date.now()
  loading.value = true
  pageError.value = ''
  sectionErrors.value = { allocation: '', performance: '', income: '' }
  showMore.value = false
  quote.value = stockStore.getFund(props.code) ?? null

  const historyCache = readFundDetailCache<FundNavPoint[]>(HISTORY_CACHE_SCOPE, props.code, HISTORY_CACHE_TTL, now)
  const profileCache = readFundDetailCache<FundProfile>(PROFILE_CACHE_SCOPE, props.code, PROFILE_CACHE_TTL, now)
  const allocationCache = readFundDetailCache<FundAllocation>(ALLOCATION_CACHE_SCOPE, props.code, ALLOCATION_CACHE_TTL, now)
  const benchmarkCache = readFundDetailCache<KlinePoint[]>('benchmark', 'sh000300', BENCHMARK_CACHE_TTL, now)
  if (historyCache) history.value = historyCache.value
  if (profileCache) profile.value = profileCache.value
  if (allocationCache) allocation.value = allocationCache.value
  if (benchmarkCache) benchmark.value = benchmarkCache.value

  const fetchHistoryRemotely = shouldRefreshFundHistory(historyCache, quote.value?.navDate ?? '', force)
  const fetchProfileRemotely = force || !profileCache?.isFresh
  const fetchAllocationRemotely = force || !allocationCache?.isFresh
  const fetchBenchmarkRemotely = force || !benchmarkCache?.isFresh

  const results = await Promise.allSettled([
    fetchFunds([props.code]),
    fetchHistoryRemotely ? fetchFundHistory(props.code) : Promise.resolve(historyCache?.value ?? []),
    fetchProfileRemotely ? fetchFundProfile(props.code) : Promise.resolve(profileCache?.value as FundProfile),
    fetchAllocationRemotely ? fetchFundAllocation(props.code) : Promise.resolve(allocationCache?.value as FundAllocation),
    fetchBenchmarkRemotely ? fetchIndexHistory('sh000300') : Promise.resolve(benchmarkCache?.value ?? [])
  ])
  if (version !== requestVersion) return

  const [quoteResult, historyResult, profileResult, allocationResult, benchmarkResult] = results
  if (quoteResult.status === 'fulfilled' && quoteResult.value[0]) quote.value = quoteResult.value[0]
  if (historyResult.status === 'fulfilled') {
    history.value = historyResult.value
    if (fetchHistoryRemotely) writeFundDetailCache(HISTORY_CACHE_SCOPE, props.code, historyResult.value, now)
  } else {
    sectionErrors.value.performance = historyCache
      ? '历史净值刷新失败，正在展示最近缓存'
      : `业绩数据暂不可用：${errorMessage(historyResult.reason)}`
  }
  if (profileResult.status === 'fulfilled') {
    profile.value = profileResult.value
    if (fetchProfileRemotely) writeFundDetailCache(PROFILE_CACHE_SCOPE, props.code, profileResult.value, now)
  }
  if (allocationResult.status === 'fulfilled') {
    allocation.value = allocationResult.value
    if (fetchAllocationRemotely) writeFundDetailCache(ALLOCATION_CACHE_SCOPE, props.code, allocationResult.value, now)
  } else {
    sectionErrors.value.allocation = allocationCache
      ? '披露数据刷新失败，正在展示最近缓存'
      : `披露数据暂不可用：${errorMessage(allocationResult.reason)}`
  }
  if (benchmarkResult.status === 'fulfilled') {
    benchmark.value = benchmarkResult.value
    if (fetchBenchmarkRemotely) writeFundDetailCache('benchmark', 'sh000300', benchmarkResult.value, now)
  } else {
    sectionErrors.value.performance ||= benchmarkCache
      ? '沪深300刷新失败，正在展示最近缓存'
      : `基准数据暂不可用：${errorMessage(benchmarkResult.reason)}`
  }

  const migrationNav = officialNav.value
  const migrationDate = officialNavDate.value || today()
  if (migrationNav && migrationNav > 0) {
    try {
      stockStore.ensureFundLedger(props.code, migrationDate, migrationNav)
      stockStore.rebuildFundLedgerSnapshots(props.code, history.value)
    } catch (error) {
      sectionErrors.value.income = `持仓账本暂不可用：${errorMessage(error)}`
    }
  }

  const successfulSections = results.filter((result) => result.status === 'fulfilled').length
  if (successfulSections === 0) pageError.value = '远端数据暂不可用，本地持仓仍可查看'
  const cachedTimes = [historyCache, profileCache, allocationCache, benchmarkCache]
    .map((entry) => entry?.savedAt ?? 0)
  const displayUpdateTime = results.some((result) => result.status === 'fulfilled')
    ? now
    : Math.max(...cachedTimes)
  updatedAt.value = displayUpdateTime > 0
    ? new Date(displayUpdateTime).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    : ''
  loading.value = false
}

function handleAction(action: FundAction, event?: MouseEvent): void {
  if (action === 'more') {
    showMore.value = !showMore.value
    return
  }
  if (!activeAction.value && event?.currentTarget instanceof HTMLElement) {
    actionTrigger = event.currentTarget
  }
  showMore.value = false
  editingTransaction.value = null
  activeAction.value = action
}

function closeAction(): void {
  activeAction.value = null
  editingTransaction.value = null
  void nextTick(() => {
    actionTrigger?.focus()
    actionTrigger = null
  })
}

function handleActionOverlayKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    closeAction()
    return
  }
  trapModalFocus(event, actionOverlayRef.value)
}

function editTransaction(transaction: FundTransaction): void {
  if (transaction.type === 'adjustment') return
  editingTransaction.value = transaction
  activeAction.value = transaction.type
}

function saveTransaction(input: FundTransactionInput): void {
  try {
    if (editingTransaction.value) {
      stockStore.editFundTransaction(props.code, editingTransaction.value.id, input)
    } else {
      stockStore.ensureFundLedger(props.code, input.tradeDate, input.nav, true)
      stockStore.applyFundTransaction(props.code, input)
    }
    stockStore.rebuildFundLedgerSnapshots(props.code, history.value)
    activeTab.value = 'income'
    closeAction()
  } catch (error) {
    pageError.value = `保存失败：${errorMessage(error)}`
  }
}

function deleteTransaction(id: string): void {
  if (!window.confirm('确认删除这条交易记录？删除后将重算后续持仓与收益。')) return
  try {
    stockStore.deleteFundTransaction(props.code, id)
    stockStore.rebuildFundLedgerSnapshots(props.code, history.value)
  } catch (error) {
    pageError.value = `删除失败：${errorMessage(error)}`
  }
}

function clearPosition(): void {
  if (!window.confirm('确认删除该基金的本地持仓与交易账本？基金仍会保留在自选列表。')) return
  stockStore.clearFundLedger(props.code)
  stockStore.clearFundPosition(props.code)
  showMore.value = false
}

function formatNav(value: number | null | undefined): string {
  return value && Number.isFinite(value) ? value.toFixed(4) : '--'
}

function formatPercent(value: number | null | undefined, signed = false): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return `${signed && value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatMoney(value: number, signed = false): string {
  return `${signed && value > 0 ? '+' : ''}¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function profitClass(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) return ''
  return value > 0 ? 'up' : 'down'
}

watch(() => props.code, () => {
  activeTab.value = 'performance'
  closeAction()
  quote.value = null
  history.value = []
  profile.value = null
  allocation.value = null
  benchmark.value = []
  void loadFundDetail()
}, { immediate: true })

watch(() => stockStore.getFund(props.code), (nextQuote) => {
  if (nextQuote) quote.value = nextQuote
})

watch(activeAction, (nextAction) => {
  if (nextAction) {
    void nextTick(() => focusFirstModalControl(actionOverlayRef.value))
  }
})
</script>

<style scoped>
.fund-detail-view { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; color: var(--text-primary); background: var(--window-bg); }
.fund-detail-loading { position: relative; height: 100%; display: flex; align-items: center; justify-content: center; gap: 10px; color: var(--text-muted); }
.fund-detail-loading button { position: absolute; top: 12px; right: 16px; display: grid; width: 28px; height: 28px; place-items: center; border: 0; color: inherit; background: transparent; cursor: pointer; }
.loading-orbit { width: 16px; height: 16px; border: 2px solid var(--divider-color); border-top-color: #6f94f8; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.fund-header { flex: 0 0 92px; display: grid; grid-template-columns: minmax(200px, 1.25fr) 105px minmax(225px, 1.1fr); align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--divider-color); background: linear-gradient(115deg, rgba(91, 140, 255, .09), transparent 58%); }
.identity-block { display: flex; align-items: center; min-width: 0; gap: 11px; }
.close-btn { flex: 0 0 auto; display: grid; width: 27px; height: 27px; place-items: center; border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-secondary); background: var(--card-bg); cursor: pointer; }
.close-btn:hover { color: var(--text-primary); background: var(--card-bg-hover); }
.fund-identity { min-width: 0; }
.identity-line { display: flex; align-items: center; min-width: 0; gap: 7px; }
.identity-line h2 { overflow: hidden; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; font-size: 17px; font-weight: 680; letter-spacing: 0; }
.code-chip { flex: 0 0 auto; padding: 2px 5px; border: 1px solid rgba(111, 148, 248, .22); border-radius: 5px; color: #8fb0ff; background: rgba(91, 140, 255, .08); font: 650 10px/1.3 ui-monospace, monospace; }
.fund-tags { display: flex; gap: 5px; margin-top: 7px; }
.fund-tags span { padding: 2px 5px; border-radius: 4px; color: var(--text-muted); background: var(--card-bg); font-size: 10px; }
.nav-block { min-width: 0; padding-left: 14px; border-left: 1px solid var(--divider-color); }
.nav-source { color: var(--text-muted); font-size: 10px; letter-spacing: 0; }
.nav-source.estimate { color: #f0a35b; }
.nav-line { display: flex; align-items: baseline; gap: 7px; margin: 2px 0; }
.nav-line strong { font-size: 21px; font-weight: 710; letter-spacing: 0; }
.nav-line span { font-size: 10px; font-weight: 650; }
.nav-block small { color: var(--text-muted); font-size: 10px; }
.remote-metrics { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3px; }
.remote-metrics div { min-width: 0; padding: 7px 3px 6px; border-radius: 8px; background: var(--card-bg); }
.remote-metrics span, .remote-metrics strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.remote-metrics span { color: var(--text-muted); font-size: 10px; }
.remote-metrics strong { margin-top: 4px; color: var(--text-primary); font-size: 10px; }
.up { color: var(--danger) !important; }
.down { color: var(--success) !important; }
.page-notice { flex: 0 0 22px; display: flex; align-items: center; padding: 0 18px; color: #f0a35b; background: rgba(245, 158, 11, .08); font-size: 10px; }
.fund-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 184px; }
.visual-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 0 16px 5px 18px; }
.fund-tabs { flex: 0 0 39px; display: grid; grid-template-columns: repeat(3, 1fr); border-bottom: 1px solid var(--divider-color); }
.fund-tabs button { position: relative; border: 0; color: var(--text-muted); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.fund-tabs button:hover { color: var(--text-primary); }
.fund-tabs button.active { color: var(--text-primary); font-weight: 650; }
.fund-tabs button.active::after { position: absolute; bottom: -1px; left: 35%; width: 30%; height: 2px; border-radius: 999px; background: #6f94f8; content: ''; }
.tab-content { flex: 1; min-height: 0; overflow-y: auto; padding-top: 10px; }
.position-panel { min-width: 0; display: flex; flex-direction: column; padding: 12px 14px 7px; border-left: 1px solid var(--divider-color); background: rgba(255, 255, 255, .018); }
.position-title { display: flex; align-items: end; justify-content: space-between; }
.eyebrow { display: block; color: #6f94f8; font-size: 10px; font-weight: 800; letter-spacing: 0; }
.position-title h3 { margin-top: 2px; font-size: 12px; }
.position-title button { display: inline-flex; align-items: center; gap: 1px; border: 0; color: #8fb0ff; background: transparent; font: inherit; font-size: 10px; cursor: pointer; }
.hero-position { margin: 12px 0 10px; padding: 10px; border: 1px solid rgba(111, 148, 248, .12); border-radius: 10px; background: linear-gradient(135deg, rgba(91, 140, 255, .13), rgba(91, 140, 255, .025)); }
.hero-position span, .hero-position strong, .hero-position small { display: block; }
.hero-position span { color: var(--text-muted); font-size: 10px; }
.hero-position strong { margin-top: 3px; font-size: 17px; letter-spacing: 0; }
.hero-position small { margin-top: 3px; color: var(--text-muted); font-size: 10px; }
.position-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 7px; }
.position-grid div { min-width: 0; }
.position-grid span, .position-grid strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.position-grid span { color: var(--text-muted); font-size: 10px; }
.position-grid strong { margin-top: 2px; color: var(--text-primary); font-size: 10px; }
.no-position { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
.empty-ring { display: grid; width: 35px; height: 35px; place-items: center; margin-bottom: 8px; border: 1px solid var(--border-color); border-radius: 50%; color: #8fb0ff; background: var(--card-bg); }
.no-position strong { font-size: 10px; }
.no-position p { max-width: 140px; margin-top: 4px; color: var(--text-muted); font-size: 10px; line-height: 1.5; }
.data-footnote { margin-top: auto; padding-top: 7px; border-top: 1px solid var(--divider-color); color: var(--text-muted); font-size: 10px; line-height: 1.35; white-space: normal; }
.data-footnote i { display: inline-block; width: 5px; height: 5px; margin-right: 3px; border-radius: 50%; background: var(--success); }
.data-footnote i.live { background: #f0a35b; box-shadow: 0 0 6px rgba(240, 163, 91, .6); }
.fund-actions { position: relative; flex: 0 0 49px; display: grid; grid-template-columns: repeat(5, 1fr); border-top: 1px solid var(--divider-color); background: var(--solid-bg); }
.fund-actions > button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 1px; border: 0; color: var(--text-muted); background: transparent; cursor: pointer; }
.fund-actions > button:hover { color: var(--text-primary); background: var(--card-bg-hover); }
.fund-action-icon { color: #8fb0ff; }
.fund-actions > button small { font-size: 10px; }
.more-menu { position: absolute; right: 7px; bottom: 45px; width: 98px; overflow: hidden; padding: 4px; border: 1px solid var(--border-color); border-radius: 9px; background: var(--solid-bg); box-shadow: 0 12px 35px rgba(0, 0, 0, .35); z-index: 6; }
.more-menu button { width: 100%; padding: 7px 8px; border: 0; border-radius: 6px; color: var(--text-secondary); text-align: left; background: transparent; font: inherit; font-size: 10px; cursor: pointer; }
.more-menu button:hover { background: var(--card-bg-hover); }
.more-menu button.danger { color: var(--danger); }
.action-overlay { position: absolute; inset: 0; display: grid; place-items: center; padding: 10px; background: rgba(4, 7, 11, .58); z-index: 10; }
</style>
