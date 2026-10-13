<template>
  <div class="quant-view" :class="{ wide: rows.length > 0 }">
    <div class="quant-header">
      <span class="quant-title">量化 · 自选池</span>
      <span class="quant-sub">{{ summaryText }}</span>
      <div class="cl-segmented cl-segmented--xs topn-switch" role="group" aria-label="推荐数量">
        <button
          v-for="option in TOP_N_OPTIONS"
          :key="String(option.value)"
          class="cl-segmented__item"
          type="button"
          :class="{ 'is-active': topN === option.value }"
          :aria-pressed="topN === option.value"
          @click="switchTopN(option.value)"
        >
          {{ option.label }}
        </button>
      </div>
      <input
        ref="importFileRef"
        class="import-report-input"
        type="file"
        accept=".json,application/json"
        hidden
        @change="onImportReportFile"
      />
      <button class="cl-iconbtn cl-iconbtn--sm cl-iconbtn--accent quant-refresh" type="button" title="导入研究报告 JSON" aria-label="导入研究报告 JSON" @click="importFileRef?.click()">
        <FileUp aria-hidden="true" />
      </button>
      <button class="cl-iconbtn cl-iconbtn--sm quant-refresh" type="button" title="重新取数并计算" aria-label="重新取数并计算" @click="hardReload">
        <RotateCw aria-hidden="true" />
      </button>
    </div>

    <div class="quant-body">
      <div v-if="loading" class="cl-empty quant-empty"><span class="cl-spinner"></span>正在拉取 K 线与计算因子…</div>
      <div v-else-if="rows.length === 0 && holdingRows.length === 0" class="cl-empty quant-empty">
        <p class="cl-empty__title">{{ stockStore.watchList.length === 0 ? '自选列表暂无股票' : '暂未取得可用评分行情' }}</p>
        <span class="cl-empty__desc">{{ stockStore.watchList.length === 0 ? '添加股票自选后即可评分' : '可刷新行情后重试' }}</span>
      </div>

      <template v-else>
        <div class="quant-column column-left">
          <FactorRankSection :rows="rows" />
        </div>
        <div class="quant-column column-right">
          <HoldingsDriftSection
            :rows="holdingRows"
            :target-mode="targetMode"
            :holding-count="comparison.heldCount"
            :holding-value="comparison.heldValue"
            :missing-held-quotes="comparison.missingHeldQuotes"
            @switch-mode="switchTargetMode"
          />
          <BacktestSection :backtest="backtest" :strategy="strategyBacktest" :strategy-label="topNLabel" :ic-mean="icMean" />
          <section v-if="importedReport" class="quant-section">
            <h4 class="cl-section-head">研究报告<span class="cl-section-head__sub">{{ importedReport.strategyId }} · {{ importedReport.evidenceStatus }} · {{ isUserImported ? '用户导入' : '内置' }}</span></h4>
            <div class="cl-stat-grid quant-metrics">
              <div v-for="metric in importedMetrics" :key="metric.label" class="cl-stat cl-stat--compact metric">
                <span class="cl-stat__label">{{ metric.label }}</span>
                <strong class="cl-stat__value">{{ metric.value }}</strong>
              </div>
            </div>
            <svg v-if="importedReport.nav.length > 1" class="quant-nav" viewBox="0 0 240 60" preserveAspectRatio="none">
              <polyline
                :points="importedNavPoints"
                class="cl-chart__line"
                :class="(importedReport.metrics.total_return ?? 0) >= 0 ? 'nav-up' : 'nav-down'"
              />
            </svg>
            <p class="cl-hint quant-hint">区间 {{ importedReport.interval?.start ?? '?' }} ~ {{ importedReport.interval?.end ?? '?' }}；{{ isUserImported ? '由文件导入' : `历史示例（${importedReport.sourcePoolSize ?? '未知'}只固定池）` }}，与当前 {{ stockStore.watchList.length }} 只自选独立展示。</p>
          </section>
        </div>
      </template>
    </div>

    <div class="cl-statusbar quant-bottom">
      <button class="cl-btn cl-btn--sm cl-btn--ghost quant-back" type="button" title="返回自选" @click="goBack">
        <ArrowLeft aria-hidden="true" />
        返回自选
      </button>
      <span class="cl-spacer"></span>
      <span class="cl-statusbar__time quant-updated">{{ updatedText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ArrowLeft, FileUp, RotateCw } from 'lucide-vue-next'
import '../components/quant/quant.css'
import { useStockStore } from '../stores/stock'
import { lastWatchlistViewType } from '../utils/market'
import FactorRankSection from '../components/quant/FactorRankSection.vue'
import HoldingsDriftSection from '../components/quant/HoldingsDriftSection.vue'
import BacktestSection from '../components/quant/BacktestSection.vue'
import { invalidateQuantCache } from '../utils/quant/cache'
import { TOP_N_OPTIONS, type TopNOption } from '../utils/quant/selector'
import { compareRecordedHoldings } from '../utils/quant/holdings'
const importFileRef = ref<HTMLInputElement | null>(null)
import { parseReport, formatReportMetrics, type ImportedReport } from '../utils/quant/report'
import builtinReportUrl from '../../public/builtin-report.json?url'
import { readPersistedSlice, updatePersistedSlice } from '../utils/persistence'
import { computeFactorRows, loadQuantKlineBundle, runEqualWeightBacktest, runFactorTopNBacktest, summarizeRankIc, type BacktestResult, type FactorRow } from '../utils/quant'

const stockStore = useStockStore()
const rows = ref<(FactorRow & { name: string })[]>([])
const targetMode = ref<'equal' | 'score'>('equal')
const topN = ref<TopNOption>(5)
const importedReport = ref<ImportedReport | null>(null)
const isUserImported = ref(false)
const backtest = ref<BacktestResult | null>(null)
const strategyBacktest = ref<BacktestResult | null>(null)
const icMean = ref<number | null>(null)
let lastUsable: Record<string, import('../api/stock').KlinePoint[]> = {}
const loading = ref(false)
const updatedAt = ref<Date | null>(null)
let pendingReload = false

const topNLabel = computed(() => TOP_N_OPTIONS.find((option) => option.value === topN.value)?.label ?? 'Top 5')
const summaryText = computed(() => `自选 ${stockStore.watchList.length} 只 · 可评分 ${rows.value.filter((row) => row.composite !== null).length} 只 · 已录持仓 ${comparison.value.heldCount} 只 · ${topNLabel.value}`)
const comparison = computed(() => {
  const prices: Record<string, number | undefined> = {}
  for (const code of stockStore.watchList) {
    prices[code] = stockStore.stocks.get(code)?.price
  }
  return compareRecordedHoldings(
    rows.value,
    stockStore.stockPositions,
    prices,
    topN.value,
    targetMode.value,
    displayName
  )
})
const holdingRows = computed(() => comparison.value.rows)
const importedNavPoints = computed(() => {
  const nav = importedReport.value?.nav ?? []
  if (nav.length < 2) {
    return ''
  }
  const values = nav.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return nav
    .map((point, index) => `${(index / (nav.length - 1)) * 240},${60 - ((point.value - min) / span) * 56 - 2}`)
    .join(' ')
})

const importedMetrics = computed(() => (importedReport.value ? formatReportMetrics(importedReport.value) : null))
const updatedText = computed(() => (updatedAt.value
  ? `${String(updatedAt.value.getHours()).padStart(2, '0')}:${String(updatedAt.value.getMinutes()).padStart(2, '0')} 更新`
  : ''))


function switchTopN(value: TopNOption): void {
  if (topN.value === value) {
    return
  }
  topN.value = value
  updatePersistedSlice('quantTopN', value)
  if (Object.keys(lastUsable).length) {
    strategyBacktest.value = runFactorTopNBacktest(lastUsable, value)
  }
}

function onImportReportFile(event: Event): void {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) {
    return
  }
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const payload = JSON.parse(String(reader.result))
      const report = parseReport(payload)
      if (!report) {
        window.alert('报告格式不支持：需要研究端导出的 v1 版本 JSON')
        return
      }
      importedReport.value = report
      isUserImported.value = true
      updatePersistedSlice('importedQuantReport', report)
    } catch {
      window.alert('报告文件解析失败，请确认是有效的 JSON 文件')
    }
  }
  reader.readAsText(file, 'utf-8')
}

function displayName(code: string): string {
  const stock = stockStore.stocks.get(code)
  return stock?.name || code
}

function hardReload(): void {
  invalidateQuantCache()
  void reload()
}

async function reload(): Promise<void> {
  const codes = [...stockStore.watchList]
  if (codes.length === 0) {
    rows.value = []
    backtest.value = null
    strategyBacktest.value = null
    icMean.value = null
    lastUsable = {}
    return
  }
  if (loading.value) {
    pendingReload = true
    return
  }

  loading.value = true
  try {
    const bundle = await loadQuantKlineBundle(codes)
    const usable = Object.fromEntries(
      Object.entries(bundle.adjusted).filter(([, points]) => points.length >= 6)
    )

    const factorRows = computeFactorRows(usable)
    rows.value = factorRows.map((row) => ({ ...row, name: displayName(row.code) }))
    lastUsable = usable
    backtest.value = runEqualWeightBacktest(usable)
    strategyBacktest.value = runFactorTopNBacktest(usable, topN.value)
    icMean.value = summarizeRankIc(usable).icMean
    updatedAt.value = new Date()
  } finally {
    loading.value = false
    if (pendingReload) {
      pendingReload = false
      void reload()
    }
  }
}

function goBack(): void {
  stockStore.setActiveAssetType(lastWatchlistViewType())
}

function switchTargetMode(mode: 'equal' | 'score'): void {
  if (targetMode.value === mode) {
    return
  }
  targetMode.value = mode
  updatePersistedSlice('quantTargetMode', mode)
}

watch(() => [...stockStore.watchList], () => { void reload() })

onMounted(async () => {
  const savedMode = readPersistedSlice('quantTargetMode')
  if (savedMode === 'score') {
    targetMode.value = 'score'
  }
  const savedTopN = readPersistedSlice('quantTopN')
  const parsedTopN = TOP_N_OPTIONS.find((option) => option.value === savedTopN)
  if (parsedTopN) {
    topN.value = parsedTopN.value
  }
  const savedReport = readPersistedSlice('importedQuantReport')
  const reparsed = savedReport ? parseReport(savedReport) : null
  if (reparsed) {
    importedReport.value = reparsed
    isUserImported.value = true
  } else {
    // 无用户导入时加载随版本分发的内置报告（用户导入后覆盖）
    try {
      const response = await fetch(builtinReportUrl)
      if (response.ok) {
        const builtin = parseReport(await response.json())
        if (builtin) {
          importedReport.value = builtin
        }
      }
    } catch {
      // 内置报告不可用时静默跳过
    }
  }
  void reload()
})
</script>

<style scoped>
.quant-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0}
.quant-header{display:flex;align-items:center;gap:3px;margin:0 10px 8px}
.quant-title{font-size:var(--fs-md);font-weight:800;color:var(--text-primary);white-space:nowrap}
.quant-sub{flex:1;min-width:0;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topn-switch{margin-left:auto;flex-shrink:0}
.quant-body{flex:1;min-height:0;overflow-y:auto;padding:0 10px 8px;display:flex;flex-direction:column;gap:12px}
.quant-view.wide .quant-body{flex-direction:row;overflow:hidden;gap:8px}
.quant-column{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:12px}
.quant-view:not(.wide) .quant-column{flex:1}
.quant-view.wide .column-left{overflow-y:auto;padding-right:4px}
.quant-view.wide .column-right{overflow-y:auto;padding-left:4px}
.quant-empty{flex:1}
.quant-view .quant-metrics{margin-bottom:6px}
</style>
