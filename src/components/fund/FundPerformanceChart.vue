<template>
  <section class="fund-chart-card">
    <div class="cl-legend chart-legend">
      <span class="legend-fund">本基金 <strong :class="valueClass(latestFund)">{{ formatPercent(latestFund) }}</strong></span>
      <span class="legend-benchmark">沪深300 <strong :class="valueClass(latestBenchmark)">{{ formatPercent(latestBenchmark) }}</strong></span>
      <span v-if="costReturn !== null" class="cost-legend">成本收益 {{ formatPercent(costReturn) }}</span>
    </div>

    <div class="chart-stage">
      <div v-if="loading" class="cl-empty chart-state"><span class="cl-spinner"></span>正在加载业绩走势...</div>
      <div v-else-if="error && !model" class="cl-empty chart-state error">{{ error }}</div>
      <div v-else-if="!model" class="cl-empty chart-state">暂无可对齐的业绩数据</div>
      <svg v-else viewBox="0 0 520 210" preserveAspectRatio="none" aria-label="基金和沪深300业绩对比图">
        <line v-for="ratio in gridRatios" :key="ratio" class="cl-chart__grid grid-line" x1="28" x2="506" :y1="gridY(ratio)" :y2="gridY(ratio)" />
        <line v-if="zeroY !== null" class="cl-chart__baseline zero-line" x1="28" x2="506" :y1="zeroY" :y2="zeroY" />
        <path v-if="costPath" class="cost-line" :d="costPath" />
        <path class="series-line benchmark" :d="benchmarkPath" />
        <path class="series-line fund" :d="fundPath" />
        <text class="cl-chart__axis cl-chart__axis--sm axis-label" x="28" y="204">{{ firstDate }}</text>
        <text class="cl-chart__axis cl-chart__axis--sm axis-label end" x="506" y="204">{{ lastDate }}</text>
        <text class="cl-chart__axis cl-chart__axis--sm axis-label" x="2" y="20">{{ formatAxis(domainMax) }}</text>
        <text class="cl-chart__axis cl-chart__axis--sm axis-label" x="2" y="188">{{ formatAxis(domainMin) }}</text>
      </svg>
    </div>
    <p v-if="error && model" class="cl-hint cache-warning">{{ error }}</p>

    <div class="cl-segmented cl-segmented--ghost cl-segmented--block range-switch" role="group" aria-label="业绩时间范围">
      <button
        v-for="item in ranges"
        :key="item.value"
        class="cl-segmented__item"
        type="button"
        :class="{ active: range === item.value }"
        :aria-pressed="range === item.value"
        @click="emit('update:range', item.value)"
      >{{ item.label }}</button>
    </div>

    <div class="cl-table-wrap cl-table-wrap--plain">
      <table class="cl-table cl-table--compact nav-history-table">
        <thead>
          <tr><th>日期</th><th class="is-num">单位净值</th><th class="is-num">累计净值</th><th class="is-num">日涨幅</th></tr>
        </thead>
        <tbody>
          <tr v-for="row in historyRows" :key="row.date" class="nav-history-row">
            <td>{{ row.date }}</td>
            <td class="is-num">{{ row.nav.toFixed(4) }}</td>
            <td class="is-num">{{ row.accumulatedNav.toFixed(4) }}</td>
            <td class="is-num" :class="valueClass(row.changePercent ?? null)">{{ formatChange(row.changePercent) }}</td>
          </tr>
        </tbody>
      </table>
      <div v-if="!historyRows.length" class="cl-empty nav-history-empty"><span class="cl-empty__desc">暂无历史净值</span></div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FundNavPoint } from '../../api/stock'
import { getRange } from '../../utils/chart'
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
const domain = computed(() => getRange([
  ...(props.model?.fund ?? []).map((point) => point.value),
  ...(props.model?.benchmark ?? []).map((point) => point.value),
  ...(props.costReturn === null ? [] : [props.costReturn]),
  0
]))
const domainMin = computed(() => domain.value[0])
const domainMax = computed(() => domain.value[1])
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
/* 本基金用系列色 1、沪深300 用系列色 4，与股票详情的均线配色一致；涨跌色跟随 data-trend */
.fund-chart-card { --line-fund: var(--series-1); --line-benchmark: var(--series-4); min-height: 238px; }
.chart-legend { gap: 8px 18px; min-height: 24px; color: var(--text-secondary); font-size: var(--fs-xs); }
.chart-legend > span::before { width: 14px; height: 2px; border-radius: 999px; }
.legend-fund { --c: var(--line-fund); }
.legend-benchmark { --c: var(--line-benchmark); }
.chart-legend > .cost-legend { color: var(--text-muted); }
.chart-legend > .cost-legend::before { height: 0; border-top: 1px dashed var(--text-muted); background: transparent; }
.chart-legend strong { font-weight: 650; color: var(--text-primary); }
.up { color: var(--rise) !important; }
.down { color: var(--fall) !important; }
.chart-stage { position: relative; height: 190px; margin-top: 5px; }
.chart-stage svg { width: 100%; height: 100%; overflow: visible; }
.chart-state { height: 100%; flex-direction: row; padding: 0; font-size: var(--fs-sm); }
.chart-state.error, .cache-warning { color: var(--c-amber); }
.cache-warning { margin-top: -2px; }
.series-line, .cost-line { fill: none; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.series-line { stroke-width: 2; }
.series-line.fund { stroke: var(--line-fund); }
.series-line.benchmark { stroke: var(--line-benchmark); stroke-width: 1.55; }
.cost-line { stroke: var(--text-muted); stroke-width: 1; stroke-dasharray: 5 5; }
.axis-label.end { text-anchor: end; }
.range-switch { margin-top: 3px; }
.range-switch .cl-segmented__item { height: 26px; font-size: var(--fs-xs); }
.cl-table-wrap--plain { margin-top: 8px; padding-bottom: 10px; }
.nav-history-empty { padding: 22px 0; }
</style>
