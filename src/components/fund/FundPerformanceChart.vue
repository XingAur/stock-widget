<template>
  <section class="fund-chart-card">
    <div class="chart-legend">
      <span><i class="legend-line fund" />本基金 <strong :class="valueClass(latestFund)">{{ formatPercent(latestFund) }}</strong></span>
      <span><i class="legend-line benchmark" />沪深300 <strong :class="valueClass(latestBenchmark)">{{ formatPercent(latestBenchmark) }}</strong></span>
      <span v-if="costReturn !== null" class="cost-legend"><i class="legend-line cost" />成本收益 {{ formatPercent(costReturn) }}</span>
    </div>

    <div class="chart-stage">
      <div v-if="loading" class="chart-state">正在加载业绩走势...</div>
      <div v-else-if="error && !model" class="chart-state error">{{ error }}</div>
      <div v-else-if="!model" class="chart-state">暂无可对齐的业绩数据</div>
      <svg v-else viewBox="0 0 520 210" preserveAspectRatio="none" aria-label="基金和沪深300业绩对比图">
        <line v-for="ratio in gridRatios" :key="ratio" class="grid-line" x1="28" x2="506" :y1="gridY(ratio)" :y2="gridY(ratio)" />
        <line v-if="zeroY !== null" class="zero-line" x1="28" x2="506" :y1="zeroY" :y2="zeroY" />
        <path v-if="costPath" class="cost-line" :d="costPath" />
        <path class="series-line benchmark" :d="benchmarkPath" />
        <path class="series-line fund" :d="fundPath" />
        <text class="axis-label" x="28" y="204">{{ firstDate }}</text>
        <text class="axis-label end" x="506" y="204">{{ lastDate }}</text>
        <text class="axis-label" x="2" y="20">{{ formatAxis(domainMax) }}</text>
        <text class="axis-label" x="2" y="188">{{ formatAxis(domainMin) }}</text>
      </svg>
    </div>
    <p v-if="error && model" class="cache-warning">{{ error }}</p>

    <div class="range-switch" role="group" aria-label="业绩时间范围">
      <button
        v-for="item in ranges"
        :key="item.value"
        type="button"
        :class="{ active: range === item.value }"
        @click="emit('update:range', item.value)"
      >{{ item.label }}</button>
    </div>

    <div class="nav-history-table">
      <div class="nav-history-head">
        <span>日期</span>
        <span>单位净值</span>
        <span>累计净值</span>
        <span>日涨幅</span>
      </div>
      <div v-for="row in historyRows" :key="row.date" class="nav-history-row">
        <strong>{{ row.date }}</strong>
        <span>{{ row.nav.toFixed(4) }}</span>
        <span>{{ row.accumulatedNav.toFixed(4) }}</span>
        <span :class="valueClass(row.changePercent ?? null)">{{ formatChange(row.changePercent) }}</span>
      </div>
      <div v-if="!historyRows.length" class="nav-history-empty">暂无历史净值</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FundNavPoint } from '../../api/stock'
import {
  createLinePath,
  filterFundNavPointsByRange,
  type FundChartRange,
  type FundPerformanceSeries
} from '../../utils/fundChart'

const props = withDefaults(defineProps<{
  model: FundPerformanceSeries | null
  history: FundNavPoint[]
  range: FundChartRange
  loading?: boolean
  error?: string
  costReturn?: number | null
}>(), {
  loading: false,
  error: '',
  costReturn: null
})

const emit = defineEmits<{ 'update:range': [value: FundChartRange] }>()

const ranges: Array<{ value: FundChartRange; label: string }> = [
  { value: '1m', label: '近1月' },
  { value: '3m', label: '近3月' },
  { value: '6m', label: '近6月' },
  { value: '1y', label: '近1年' },
  { value: 'all', label: '全部' }
]
const gridRatios = [0, 0.33, 0.66, 1]
const historyRows = computed(() => filterFundNavPointsByRange(props.history, props.range).reverse())
const domainMin = computed(() => {
  if (!props.model) return -1
  return Math.min(props.model.minValue, props.costReturn ?? Infinity, 0)
})
const domainMax = computed(() => {
  if (!props.model) return 1
  return Math.max(props.model.maxValue, props.costReturn ?? -Infinity, 0)
})
const fundPath = computed(() => props.model
  ? createLinePath(props.model.fund, 520, 190, 28, domainMin.value, domainMax.value)
  : '')
const benchmarkPath = computed(() => props.model
  ? createLinePath(props.model.benchmark, 520, 190, 28, domainMin.value, domainMax.value)
  : '')
const costPath = computed(() => {
  if (props.costReturn === null || !props.model) return ''
  const firstDate = props.model.fund[0]?.date ?? ''
  const lastDate = props.model.fund[props.model.fund.length - 1]?.date ?? ''
  return createLinePath(
    [{ date: firstDate, value: props.costReturn }, { date: lastDate, value: props.costReturn }],
    520,
    190,
    28,
    domainMin.value,
    domainMax.value
  )
})
const latestFund = computed(() => {
  const points = props.model?.fund ?? []
  return points[points.length - 1]?.value ?? null
})
const latestBenchmark = computed(() => {
  const points = props.model?.benchmark ?? []
  return points[points.length - 1]?.value ?? null
})
const firstDate = computed(() => shortDate(props.model?.fund[0]?.date ?? ''))
const lastDate = computed(() => {
  const points = props.model?.fund ?? []
  return shortDate(points[points.length - 1]?.date ?? '')
})
const zeroY = computed(() => {
  const span = domainMax.value - domainMin.value
  if (!props.model || span <= 0 || domainMin.value > 0 || domainMax.value < 0) return null
  return 28 + (domainMax.value / span) * 134
})

function gridY(ratio: number): number {
  return 28 + ratio * 134
}

function shortDate(date: string): string {
  return date.length >= 10 ? date.slice(5).replace('-', '/') : date
}

function formatAxis(value: number): string {
  return `${value.toFixed(1)}%`
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function formatChange(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '--'
  return `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
}

function valueClass(value: number | null): string {
  if (value === null || value === 0) return ''
  return value > 0 ? 'up' : 'down'
}
</script>

<style scoped>
.fund-chart-card { min-height: 238px; }
.chart-legend { display: flex; flex-wrap: wrap; gap: 8px 18px; min-height: 24px; color: var(--text-secondary); font-size: 11px; }
.chart-legend span { display: inline-flex; align-items: center; gap: 5px; }
.chart-legend strong { font-weight: 650; color: var(--text-primary); }
.chart-legend .up { color: var(--danger); }
.chart-legend .down { color: var(--success); }
.legend-line { width: 14px; height: 2px; border-radius: 999px; background: #5b8cff; }
.legend-line.benchmark { background: #f59e55; }
.legend-line.cost { height: 0; border-top: 1px dashed var(--text-muted); background: transparent; }
.cost-legend { color: var(--text-muted) !important; }
.chart-stage { position: relative; height: 190px; margin-top: 5px; }
.chart-stage svg { width: 100%; height: 100%; overflow: visible; }
.chart-state { height: 100%; display: grid; place-items: center; color: var(--text-muted); font-size: 12px; }
.chart-state.error { color: #f59e55; }
.cache-warning { margin-top: -2px; color: #f59e55; font-size: 8px; }
.grid-line { stroke: var(--divider-color); stroke-width: 1; }
.zero-line { stroke: var(--text-muted); stroke-width: .8; stroke-dasharray: 4 5; opacity: .5; }
.series-line, .cost-line { fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.series-line { stroke-width: 2; }
.series-line.fund { stroke: #5b8cff; }
.series-line.benchmark { stroke: #f59e55; stroke-width: 1.55; }
.cost-line { stroke: var(--text-muted); stroke-width: 1; stroke-dasharray: 5 5; }
.axis-label { fill: var(--text-muted); font-size: 9px; }
.axis-label.end { text-anchor: end; }
.range-switch { display: grid; grid-template-columns: repeat(5, 1fr); gap: 4px; margin-top: 3px; }
.range-switch button { height: 26px; border: 0; border-radius: 7px; color: var(--text-muted); background: transparent; font: inherit; font-size: 11px; cursor: pointer; }
.range-switch button:hover { color: var(--text-primary); background: var(--card-bg-hover); }
.range-switch button.active { color: #8fb0ff; background: rgba(91, 140, 255, .14); }
.nav-history-table { margin-top: 8px; padding-bottom: 10px; border-top: 1px solid var(--divider-color); }
.nav-history-head, .nav-history-row { display: grid; grid-template-columns: 1.25fr repeat(3, 1fr); align-items: center; column-gap: 8px; }
.nav-history-head { min-height: 28px; color: var(--text-muted); font-size: 9px; }
.nav-history-head span:not(:first-child), .nav-history-row span { text-align: right; }
.nav-history-row { min-height: 30px; border-top: 1px solid rgba(255, 255, 255, .035); color: var(--text-secondary); font-size: 10px; }
.nav-history-row strong { color: var(--text-primary); font-weight: 600; }
.nav-history-row .up { color: var(--danger); }
.nav-history-row .down { color: var(--success); }
.nav-history-empty { padding: 22px 0; color: var(--text-muted); text-align: center; font-size: 10px; }
</style>
