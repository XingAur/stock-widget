<template>
  <div class="quant-view" :class="{ wide: rows.length > 0 }">
    <div class="quant-header">
      <span class="quant-title">量化 · 自选池</span>
      <span class="quant-sub">{{ summaryText }}</span>
      <div class="topn-switch" role="group" aria-label="推荐数量">
        <button
          v-for="option in TOP_N_OPTIONS"
          :key="String(option.value)"
          type="button"
          :class="{ active: topN === option.value }"
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
        @change="onImportReportFile"
      />
      <button class="quant-refresh" type="button" title="导入研究报告 JSON" @click="importFileRef?.click()">📥</button>
      <button class="quant-refresh" type="button" title="重新取数并计算" @click="hardReload">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>

    <div class="quant-body">
      <div v-if="loading" class="quant-empty">正在拉取 K 线与计算因子…</div>
      <div v-else-if="rows.length === 0" class="quant-empty">
        <p>自选列表暂无股票</p>
        <span>添加股票自选后即可评分</span>
      </div>

      <template v-else>
        <div class="quant-column column-left">
          <FactorRankSection :rows="rows" />
          <HoldingsDriftSection
            :rows="holdingRows"
            :target-mode="targetMode"
            :total-assets="totalAssetsInput"
            :cash-row="cashRow"
            @switch-mode="switchTargetMode"
            @update-assets="onTotalAssetsInput"
          />
        </div>
        <div class="quant-column column-right">
          <BacktestSection :backtest="backtest" />
          <section v-if="importedReport" class="quant-section">
            <h4>研究报告<span>{{ importedReport.strategyId }} · {{ importedReport.evidenceStatus }} · {{ isUserImported ? '用户导入' : '内置' }}</span></h4>
            <div class="quant-metrics">
              <div v-for="metric in importedMetrics" :key="metric.label" class="metric">
                <span>{{ metric.label }}</span>
                <strong>{{ metric.value }}</strong>
              </div>
            </div>
            <svg v-if="importedReport.nav.length > 1" class="quant-nav" viewBox="0 0 240 60" preserveAspectRatio="none">
              <polyline
                :points="importedNavPoints"
                :class="(importedReport.metrics.total_return ?? 0) >= 0 ? 'nav-up' : 'nav-down'"
                fill="none"
                stroke-width="1.5"
              />
            </svg>
            <p class="quant-hint">区间 {{ importedReport.interval?.start ?? '?' }} ~ {{ importedReport.interval?.end ?? '?' }}；{{ isUserImported ? '由文件导入' : '随版本内置' }}，与本机回测独立展示。</p>
          </section>
        </div>
      </template>
    </div>

    <div class="quant-bottom">
      <button class="quant-back" type="button" title="返回自选" @click="goBack">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        返回自选
      </button>
      <span class="quant-updated">{{ updatedText }}</span>
    </div>
  </div>
</template>
<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStockStore } from '../stores/stock'
import { lastWatchlistViewType } from '../utils/market'
import FactorRankSection from '../components/quant/FactorRankSection.vue'
import HoldingsDriftSection from '../components/quant/HoldingsDriftSection.vue'
import BacktestSection from '../components/quant/BacktestSection.vue'
import { invalidateQuantCache } from '../utils/quant/cache'
import { TOP_N_OPTIONS, selectTopN, type TopNOption } from '../utils/quant/selector'
const importFileRef = ref<HTMLInputElement | null>(null)
import { parseReport, formatReportMetrics, type ImportedReport } from '../utils/quant/report'
import builtinReportUrl from '../../public/builtin-report.json?url'
import { readPersistedSlice, updatePersistedSlice } from '../utils/persistence'
import { computeFactorRows, loadQuantKlineBundle, runEqualWeightBacktest, type BacktestResult, type FactorRow } from '../utils/quant'

interface HoldingRow {
  code: string
  name: string
  targetPercent: number
  currentPercent: number
  drift: number
  driftAmount: number | null
  held: boolean
}

const stockStore = useStockStore()
const rows = ref<(FactorRow & { name: string })[]>([])
const targetMode = ref<'equal' | 'score'>('equal')
const topN = ref<TopNOption>(5)
const importedReport = ref<ImportedReport | null>(null)
const isUserImported = ref(false)
const totalAssetsInput = ref('')
const cashRow = ref<{ percent: number; amount: number; text: string } | null>(null)
const holdingRows = ref<HoldingRow[]>([])
const backtest = ref<BacktestResult | null>(null)
const loading = ref(false)
const updatedAt = ref<Date | null>(null)

const topNLabel = computed(() => TOP_N_OPTIONS.find((option) => option.value === topN.value)?.label ?? 'Top 5')
const summaryText = computed(() => `${rows.value.length} 只 · 推荐 ${topNLabel.value} · 评分前 3 高亮`)
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


/** 目标权重：Top-N 选择 + 等权/评分加权（与 a-share-quant selector 一致） */
function targetWeights(poolRows: FactorRow[], mode: 'equal' | 'score'): Map<string, number> {
  return selectTopN(poolRows, topN.value, mode).weights
}

function switchTopN(value: TopNOption): void {
  if (topN.value === value) {
    return
  }
  topN.value = value
  updatePersistedSlice('quantTopN', value)
  void reload()
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

function onTotalAssetsInput(value: string): void {
  totalAssetsInput.value = value
  saveTotalAssets()
}

async function reload(): Promise<void> {
  const codes = [...stockStore.watchList]
  if (codes.length === 0) {
    rows.value = []
    holdingRows.value = []
    backtest.value = null
    return
  }
  if (loading.value) {
    return
  }

  loading.value = true
  try {
    const bundle = await loadQuantKlineBundle(codes)
    const usable = Object.fromEntries(
      Object.entries(bundle.adjusted).filter(([, points]) => points.length >= 6)
    )
    const rawKlines = bundle.raw

    const factorRows = computeFactorRows(usable)
    rows.value = factorRows.map((row) => ({ ...row, name: displayName(row.code) }))
    backtest.value = runEqualWeightBacktest(usable)

    // 持仓对照：填了总资金按总资产口径（含现金与未持仓票）；否则按股票持仓内部占比
    const positions = stockStore.stockPositions
    // 估值必须用原始价（P0 修复：hfq 价的复权倍数不同，权重会失真）
    const priced = Object.keys(usable).map((code) => ({
      code,
      price: rawKlines[code]?.[rawKlines[code].length - 1]?.close ?? usable[code][usable[code].length - 1]?.close ?? 0
    }))
    const priceMap = new Map(priced.map((item) => [item.code, item.price]))
    const totalAssets = Number(totalAssetsInput.value) * 10_000

    if (totalAssets > 0) {
      const priced_ = Object.keys(usable).map((code) => {
        const price = priceMap.get(code) ?? 0
        const shares = positions[code]?.shares ?? 0
        return { code, name: displayName(code), value: shares * price }
      })
      const invested = priced_.reduce((total, item) => total + item.value, 0)
      const weights = targetWeights(rows.value, targetMode.value)
      holdingRows.value = priced_
        .map((item) => {
          const currentWeight = item.value / totalAssets
          const target = weights.get(item.code) ?? 0
          const drift = currentWeight - target
          return {
            code: item.code,
            name: item.name,
            targetPercent: Math.min(100, target * 100),
            currentPercent: Math.min(100, currentWeight * 100),
            drift,
            driftAmount: drift * totalAssets,
            held: item.value > 1
          }
        })
        .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift))
      const cashWeight = Math.max(0, 1 - invested / totalAssets)
      cashRow.value = {
        percent: cashWeight * 100,
        amount: cashWeight * totalAssets,
        text: `占 ${(cashWeight * 100).toFixed(1)}%`
      }
    } else {
      cashRow.value = null
      const heldValue = Object.entries(positions).reduce((total, [code, position]) => {
        const price = priceMap.get(code) ?? 0
        return total + position.shares * price
      }, 0)

      // 未填总资金：按股票持仓内部占比对照；未持仓的自选也列出建仓目标（无金额基数）
      const weightsInner = targetWeights(rows.value, targetMode.value)
      holdingRows.value = Object.keys(usable)
        .map((code) => {
          const price = priceMap.get(code) ?? 0
          const shares = positions[code]?.shares ?? 0
          const currentWeight = heldValue > 0 ? (shares * price) / heldValue : 0
          const target = weightsInner.get(code) ?? 0
          const drift = currentWeight - target
          return {
            code,
            name: displayName(code),
            targetPercent: Math.min(100, target * 100),
            currentPercent: Math.min(100, currentWeight * 100),
            drift,
            driftAmount: heldValue > 0 ? drift * heldValue : null,
            held: shares > 0
          }
        })
        .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift))
    }

    updatedAt.value = new Date()
  } finally {
    loading.value = false
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
  void reload()
}

function saveTotalAssets(): void {
  const value = Number(totalAssetsInput.value)
  updatePersistedSlice('quantTotalAssets', Number.isFinite(value) && value > 0 ? value : null)
}

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
  const saved = readPersistedSlice('quantTotalAssets')
  if (typeof saved === 'number' && saved > 0) {
    totalAssetsInput.value = String(saved)
  }
  void reload()
})
</script>

<style scoped>
.quant-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0}
.quant-header{display:flex;align-items:center;gap:3px;margin:0 10px 8px}
.quant-title{font-size:13px;font-weight:800;color:var(--text-primary)}
.quant-sub{flex:1;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.topn-switch{display:inline-flex;gap:1px;margin-left:auto;padding:1px;border:1px solid rgba(255,255,255,.1);border-radius:6px}
.topn-switch button{height:18px;padding:0 5px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);font-size:9px;font-weight:700;cursor:pointer}
.topn-switch button.active{color:#f8fbff;background:rgba(45,124,246,.75)}
.import-report-input{display:none}
.quant-refresh{width:22px;height:22px;margin-left:1px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:11px}
.quant-refresh:hover{color:var(--text-primary);background:rgba(255,255,255,.06)}
.quant-body{flex:1;min-height:0;overflow-y:auto;padding:0 10px 8px;display:flex;flex-direction:column;gap:12px}
.quant-view.wide .quant-body{flex-direction:row;overflow:hidden;gap:8px}
.quant-column{flex:1 1 0;min-width:0;display:flex;flex-direction:column;gap:12px}
.quant-view:not(.wide) .quant-column{flex:1}
.quant-view.wide .column-left{overflow-y:auto;padding-right:4px}
.quant-view.wide .column-right{overflow-y:auto;padding-left:4px}
.quant-nav{width:100%;height:56px;display:block;margin-bottom:6px}
.nav-up{stroke:#ff7474}
.nav-down{stroke:#3ad283}
.quant-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);text-align:center}
.quant-empty p{font-size:13px;font-weight:600;color:var(--text-secondary)}
.quant-empty span{font-size:11px}
.quant-section h4{margin:0 0 6px;font-size:11px;font-weight:700;color:var(--text-secondary)}
.quant-section h4 span{font-weight:400;font-size:9px;color:var(--text-muted);margin-left:4px}
.quant-row{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.03)}
.quant-row+.quant-row{margin-top:3px}
.quant-row.active{background:rgba(45,124,246,.12);box-shadow:inset 2px 0 0 #2d7cf6}
.quant-rank{flex:0 0 16px;font-size:11px;font-weight:800;color:var(--text-muted);text-align:center}
.quant-row.active .quant-rank{color:#5da8ff}
.quant-name{flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quant-mom{flex:0 0 44px;font-size:10px;text-align:right;font-variant-numeric:tabular-nums;color:var(--text-muted)}
.quant-score{flex:0 0 34px;font-size:12px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;color:var(--text-secondary)}
.quant-score.up{color:#ff7474}
.quant-score.down{color:#3ad283}
.quant-assets{display:inline-flex;align-items:center;gap:3px;margin-left:auto;font-size:9px;font-weight:400;color:var(--text-muted)}
.quant-assets input{width:44px;height:18px;padding:0 4px;border:1px solid rgba(255,255,255,.14);border-radius:5px;background:rgba(255,255,255,.05);color:var(--text-primary);font-size:10px;outline:none}
.quant-assets input:focus{border-color:rgba(93,168,255,.55)}
.quant-hold.cash{background:rgba(255,255,255,.02)}
.target-switch{display:inline-flex;margin-left:6px;padding:1px;border:1px solid rgba(255,255,255,.12);border-radius:6px}
.target-switch button{height:14px;padding:0 6px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);font-size:9px;font-weight:700;cursor:pointer}
.target-switch button.active{color:#f8fbff;background:rgba(45,124,246,.75)}
.quant-hold{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.03)}
.quant-hold+.quant-hold{margin-top:3px}
.quant-bars{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.quant-bar{height:4px;border-radius:2px}
.quant-bar.target{background:rgba(93,168,255,.55)}
.quant-bar.current{background:rgba(255,255,255,.22)}
.quant-drift{flex:0 0 64px;display:flex;flex-direction:column;align-items:flex-end;gap:1px;font-size:10px;font-weight:700;text-align:right;white-space:nowrap;color:var(--text-muted)}
.quant-drift i{font-style:normal;font-size:9px;font-weight:500;color:var(--text-muted);opacity:.8}
.quant-drift.up{color:#ff7474}
.quant-drift.down{color:#3ad283}
.quant-hint{margin:6px 0 0;font-size:10px;line-height:1.5;color:var(--text-muted)}
.quant-nav{width:100%;height:56px;display:block;margin-bottom:6px}
.nav-up{stroke:#ff7474}
.nav-down{stroke:#3ad283}
.quant-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.metric{display:flex;flex-direction:column;gap:2px;padding:6px 7px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.03)}
.metric span{font-size:9px;color:var(--text-muted)}
.metric strong{font-size:12px;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.metric strong.up{color:#ff7474}
.metric strong.down{color:#3ad283}
.quant-bottom{display:flex;align-items:center;justify-content:space-between;padding:4px 10px 6px}
.quant-back{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border:none;border-radius:7px;background:rgba(255,255,255,.05);color:var(--text-secondary);font-size:11px;font-weight:700;cursor:pointer}
.quant-back:hover{background:rgba(255,255,255,.09);color:var(--text-primary)}
.quant-updated{font-size:10px;color:var(--text-muted)}
</style>
