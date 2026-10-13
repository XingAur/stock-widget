<template>
  <div class="fund-detail-view">
    <div v-if="loading && !quote && history.length === 0" class="cl-empty fund-detail-loading">
      <span class="cl-spinner" />
      <span>基金详情加载中 · {{ code }}</span>
      <button class="cl-close" type="button" aria-label="关闭基金详情" title="关闭" @click="emit('close')"><X aria-hidden="true" /></button>
    </div>

    <template v-else>
      <header class="fund-header">
        <div class="identity-block">
          <button class="cl-btn cl-btn--icon cl-btn--sm close-btn" type="button" aria-label="返回基金列表" title="关闭详情" @click="emit('close')"><ArrowLeft aria-hidden="true" /></button>
          <div class="fund-identity">
            <div class="identity-line">
              <h2>{{ fundName }}</h2>
              <span class="cl-badge cl-badge--accent cl-mono code-chip">{{ code }}</span>
            </div>
            <div class="fund-tags">
              <span class="cl-tag">{{ profile?.fundType || '基金' }}</span>
              <span class="cl-tag">{{ profile?.riskLevel || '风险等级待更新' }}</span>
              <span v-if="updatedAt" class="cl-tag">更新 {{ updatedAt }}</span>
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

        <div class="cl-stat-grid remote-metrics">
          <div class="cl-stat cl-stat--compact"><span class="cl-stat__label">近一年</span><strong class="cl-stat__value" :class="profitClass(oneYearReturn)">{{ formatPercent(oneYearReturn, true) }}</strong></div>
          <div class="cl-stat cl-stat--compact"><span class="cl-stat__label">同类排名</span><strong class="cl-stat__value">{{ rankText }}</strong></div>
          <div class="cl-stat cl-stat--compact"><span class="cl-stat__label">持仓占比</span><strong class="cl-stat__value">{{ formatPercent(position?.positionPercent) }}</strong></div>
        </div>
      </header>

      <div v-if="pageError" class="cl-alert cl-alert--warning cl-alert--banner page-notice" role="status">{{ pageError }}</div>

      <main class="fund-main">
        <section class="visual-panel">
          <nav class="cl-tabs fund-tabs" role="tablist" aria-label="基金详情页签">
            <button
              v-for="tab in tabs"
              :key="tab.value"
              class="cl-tabs__item"
              role="tab"
              type="button"
              :class="{ active: activeTab === tab.value }"
              :aria-selected="activeTab === tab.value"
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
            <div><span class="cl-eyebrow cl-eyebrow--accent">MY POSITION</span><h3>持仓摘要</h3></div>
            <button class="cl-btn cl-btn--ghost cl-btn--sm records-link" type="button" @click="handleAction('records', $event)">收益明细 <ChevronRight aria-hidden="true" /></button>
          </div>

          <template v-if="position">
            <div class="cl-panel hero-position">
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
          <div v-else class="cl-empty no-position">
            <span class="cl-empty__icon empty-ring">¥</span>
            <strong class="cl-empty__title">尚未记录持仓</strong>
            <p class="cl-empty__desc">点击“加仓”或“修改持仓”建立本地账本</p>
          </div>

          <div class="data-footnote">
            <span class="cl-dot" :class="isEstimate ? 'cl-dot--warn live' : 'cl-dot--live'" />
            {{ isEstimate ? '持仓估算仅用于当前展示，不写入收益' : '收益按官方净值更新' }}
          </div>
        </aside>
      </main>

      <footer class="cl-actionbar fund-actions">
        <button
          v-for="action in actions"
          :key="action.value"
          class="cl-actionbar__item"
          type="button"
          :aria-label="action.label"
          :aria-expanded="action.value === 'more' ? showMore : undefined"
          @click="handleAction(action.value, $event)"
        >
          <component :is="action.icon" class="fund-action-icon" aria-hidden="true" />
          <small>{{ action.label }}</small>
        </button>
        <div v-if="showMore" class="cl-menu more-menu" role="menu">
          <button class="cl-menu__item" type="button" role="menuitem" @click="void loadFundDetail(true)">刷新数据</button>
          <button class="cl-menu__item cl-menu__item--danger danger" type="button" role="menuitem" @click="clearPosition">删除持仓</button>
        </div>
      </footer>

      <div
        v-if="activeAction"
        ref="actionOverlayRef"
        class="cl-backdrop cl-backdrop--contained action-overlay"
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
/* 外观来自 coolove-ui；这里只排布详情页的三段结构（头部 / 图表+持仓 / 操作栏） */
.fund-detail-view { position: relative; height: 100%; display: flex; flex-direction: column; overflow: hidden; color: var(--text-primary); }
.fund-detail-loading { position: relative; height: 100%; flex-direction: row; gap: 10px; }
.fund-detail-loading .cl-close { position: absolute; top: 12px; right: 16px; }
/* 中间列宽度随内容（净值 + 涨幅），避免在 620px 详情宽度下与右侧指标重叠 */
.fund-header { flex: 0 0 auto; min-height: 92px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(200px, 0.9fr); align-items: center; gap: 12px; padding: 12px; border-bottom: 1px solid var(--divider-color); background: linear-gradient(115deg, var(--accent-soft), transparent 58%); }
.identity-block { display: flex; align-items: center; min-width: 0; gap: 11px; }
.fund-identity { min-width: 0; }
.identity-line { display: flex; align-items: center; min-width: 0; gap: 7px; }
.identity-line h2 { overflow: hidden; color: var(--text-primary); text-overflow: ellipsis; white-space: nowrap; font-size: 17px; font-weight: 680; letter-spacing: 0; }
.code-chip { flex: 0 0 auto; }
.fund-tags { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 7px; }
.fund-tags .cl-tag { height: 18px; padding: 0 5px; border-radius: 4px; font-size: 10px; color: var(--text-muted); }
.nav-block { min-width: 0; padding-left: 14px; border-left: 1px solid var(--divider-color); }
.nav-source { color: var(--text-muted); font-size: 10px; }
.nav-source.estimate { color: var(--c-amber); }
.nav-line { display: flex; align-items: baseline; gap: 7px; margin: 2px 0; white-space: nowrap; }
.nav-line strong { font-size: 21px; font-weight: 710; font-variant-numeric: tabular-nums; }
.nav-line span { font-size: 10px; font-weight: 650; }
.nav-block small { color: var(--text-muted); font-size: 10px; }
.remote-metrics { --cols: 3; gap: 4px; }
.up { color: var(--rise); }
.down { color: var(--fall); }
.page-notice { flex: 0 0 auto; padding-inline: 18px; }
.fund-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) 184px; }
.visual-panel { min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: 0 16px 5px 18px; }
.fund-tabs { flex: 0 0 auto; }
.fund-tabs .cl-tabs__item { flex: 1; height: 38px; font-size: var(--fs-xs); font-weight: 500; }
.fund-tabs .cl-tabs__item[aria-selected="true"] { font-weight: 650; }
.fund-tabs .cl-tabs__item[aria-selected="true"]::after { left: 35%; right: 35%; }
.tab-content { flex: 1; min-height: 0; overflow-y: auto; padding-top: 10px; }
.position-panel { min-width: 0; display: flex; flex-direction: column; padding: 12px 14px 7px; border-left: 1px solid var(--divider-color); background: var(--surface-1); }
.position-title { display: flex; align-items: end; justify-content: space-between; gap: 6px; }
.position-title h3 { margin-top: 2px; font-size: var(--fs-sm); }
.records-link { height: 20px; padding: 0 2px; gap: 1px; font-size: 10px; color: var(--accent-text); }
.records-link svg { width: 12px; height: 12px; }
.hero-position { margin: 12px 0 10px; padding: 10px; border-color: color-mix(in srgb, var(--accent) 14%, transparent); border-radius: calc(10px * var(--r)); background: linear-gradient(135deg, var(--accent-soft), color-mix(in srgb, var(--accent) 3%, transparent)); }
.hero-position span, .hero-position strong, .hero-position small { display: block; }
.hero-position span { color: var(--text-muted); font-size: 10px; }
.hero-position strong { margin-top: 3px; font-size: 17px; font-variant-numeric: tabular-nums; }
.hero-position small { margin-top: 3px; color: var(--text-muted); font-size: 10px; }
.position-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 7px; }
.position-grid div { min-width: 0; }
.position-grid span, .position-grid strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.position-grid span { color: var(--text-muted); font-size: 10px; }
.position-grid strong { margin-top: 2px; color: var(--text-primary); font-size: 10px; font-variant-numeric: tabular-nums; }
.position-grid strong.up { color: var(--rise); }
.position-grid strong.down { color: var(--fall); }
.no-position { flex: 1; padding: 8px 0; }
.empty-ring { border-radius: 50%; color: var(--accent-text); font-weight: 700; }
.no-position .cl-empty__title { font-size: 10px; }
.no-position .cl-empty__desc { max-width: 140px; font-size: 10px; }
.data-footnote { display: flex; align-items: center; gap: 4px; margin-top: auto; padding-top: 7px; border-top: 1px solid var(--divider-color); color: var(--text-muted); font-size: 10px; line-height: 1.35; }
.data-footnote .cl-dot { width: 5px; height: 5px; }
.fund-actions { background: var(--surface-1); }
.more-menu { min-width: 98px; }
</style>
