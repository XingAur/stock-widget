<template>
  <section class="income-card">
    <div class="income-header">
      <div>
        <span>累计收益</span>
        <strong :class="profitClass(currentTotalProfit)">{{ formatMoney(currentTotalProfit, true) }}</strong>
      </div>
      <small>仅按已确认净值计算</small>
    </div>

    <div class="income-chart">
      <div v-if="loading" class="cl-empty income-state"><span class="cl-spinner"></span>正在重建收益曲线...</div>
      <div v-else-if="error" class="cl-empty income-state error">{{ error }}</div>
      <div v-else-if="series.length < 2" class="cl-empty income-state">交易日数据不足，暂无收益曲线</div>
      <svg v-else viewBox="0 0 520 150" preserveAspectRatio="none" aria-label="累计收益曲线">
        <defs>
          <linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1">
            <stop class="income-stop" offset="0" stop-opacity=".24" />
            <stop class="income-stop" offset="1" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line v-for="ratio in [0, .5, 1]" :key="ratio" class="cl-chart__grid grid-line" x1="24" x2="510" :y1="18 + ratio * 108" :y2="18 + ratio * 108" />
        <path class="income-area" :d="areaPath" />
        <path class="income-line" :d="linePath" />
        <line class="cl-chart__baseline income-zero-line" x1="24" x2="496" :y1="zeroY" :y2="zeroY" />
        <text class="cl-chart__axis cl-chart__axis--sm axis-label" x="2" y="21">{{ formatCompact(maxValue) }}</text>
        <text class="cl-chart__axis cl-chart__axis--sm axis-label" x="2" y="129">{{ formatCompact(minValue) }}</text>
        <text class="cl-chart__axis cl-chart__axis--sm axis-label" x="24" y="146">{{ shortDate(series[0]?.date) }}</text>
        <text class="cl-chart__axis cl-chart__axis--sm axis-label end" x="510" y="146">{{ shortDate(series[series.length - 1]?.date) }}</text>
      </svg>
    </div>

    <div class="cl-segmented cl-segmented--ghost cl-segmented--block range-switch" role="group" aria-label="收益时间范围">
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

    <div class="details-head"><span>收益明细</span><small>日期 / 收益</small></div>
    <div v-if="detailRows.length" class="cl-divided cl-divided--soft income-list">
      <div v-for="row in detailRows" :key="row.date" class="income-row">
        <span>{{ row.date }}</span>
        <small v-if="row.hasAdjustment" class="cl-badge cl-badge--accent">调仓日</small>
        <strong v-else-if="row.dailyProfit !== null" :class="profitClass(row.dailyProfit)">{{ formatMoney(row.dailyProfit, true) }}</strong>
        <strong v-else>--</strong>
      </div>
    </div>
    <div v-else class="cl-empty detail-empty">暂无收益明细</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FundDailySnapshot } from '../../utils/fundLedger'
import { createIncomeSeries, createLinePath, type FundChartRange } from '../../utils/fundChart'
import { getRange } from '../../utils/chart'

const props = withDefaults(defineProps<{
  snapshots: FundDailySnapshot[]
  range: FundChartRange
  currentTotalProfit: number
  loading?: boolean
  error?: string
}>(), {
  loading: false,
  error: ''
})

const emit = defineEmits<{ 'update:range': [value: FundChartRange] }>()
const ranges: Array<{ value: FundChartRange; label: string }> = [
  { value: '1m', label: '近1月' },
  { value: '3m', label: '近3月' },
  { value: '6m', label: '近6月' },
  { value: 'all', label: '全部' }
]
const series = computed(() => createIncomeSeries(props.snapshots, props.range))
const domain = computed(() => getRange([...series.value.map((item) => item.value), 0]))
const minValue = computed(() => domain.value[0])
const maxValue = computed(() => domain.value[1])
const zeroY = computed(() => 24 + maxValue.value / (maxValue.value - minValue.value) * 96)
const linePath = computed(() => createLinePath(series.value, 520, 144, 24, minValue.value, maxValue.value))
const areaPath = computed(() => linePath.value
  ? `${linePath.value} L 496 126 L 24 126 Z`
  : '')
const detailRows = computed(() => [...props.snapshots]
  .filter((row) => props.range === 'all' || series.value.some((point) => point.date === row.date))
  .sort((left, right) => right.date.localeCompare(left.date)))

function shortDate(date?: string): string {
  return date?.length === 10 ? date.slice(5).replace('-', '/') : (date || '')
}

function formatCompact(value: number): string {
  const absolute = Math.abs(value)
  if (absolute >= 10_000) return `${(value / 10_000).toFixed(1)}万`
  return value.toFixed(0)
}

function formatMoney(value: number, signed = false): string {
  const prefix = signed && value > 0 ? '+' : ''
  return `${prefix}¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function profitClass(value: number): string {
  return value > 0 ? 'up' : value < 0 ? 'down' : ''
}
</script>

<style scoped>
.income-card { --line-income: var(--series-1); min-height: 276px; }
.income-header { display: flex; align-items: end; justify-content: space-between; }
.income-header > div { display: flex; align-items: baseline; gap: 8px; }
.income-header span { color: var(--text-muted); font-size: 10px; }
.income-header strong { color: var(--text-primary); font-size: 18px; font-weight: 680; font-variant-numeric: tabular-nums; }
.income-header small { color: var(--text-muted); font-size: 10px; }
.up { color: var(--rise) !important; }
.down { color: var(--fall) !important; }
.income-chart { height: 150px; margin-top: 3px; }
.income-chart svg { width: 100%; height: 100%; overflow: visible; }
.income-state { height: 100%; flex-direction: row; padding: 0; font-size: var(--fs-xs); }
.income-state.error { color: var(--c-amber); }
.income-stop { stop-color: var(--line-income); }
.income-area { fill: url(#income-fill); }
.income-line { fill: none; stroke: var(--line-income); stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.axis-label.end { text-anchor: end; }
.range-switch { margin: 1px 0 9px; }
.range-switch .cl-segmented__item { height: 24px; font-size: 10px; }
.details-head { display: flex; justify-content: space-between; padding: 8px 0 4px; border-top: 1px solid var(--divider-color); color: var(--text-secondary); font-size: 10px; }
.details-head small { color: var(--text-muted); font-size: 10px; }
.income-list { display: grid; align-content: start; padding-bottom: 8px; }
.income-row { display: grid; grid-template-columns: 1fr auto; align-items: center; min-height: 24px; color: var(--text-secondary); font-size: 10px; }
.income-row small { height: 18px; font-size: 10px; font-weight: 500; }
.income-row strong { color: var(--text-primary); font-size: 10px; font-variant-numeric: tabular-nums; }
.detail-empty { padding: 13px 0; font-size: 10px; }
</style>
