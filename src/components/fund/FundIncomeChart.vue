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
      <div v-if="loading" class="income-state">正在重建收益曲线...</div>
      <div v-else-if="error" class="income-state error">{{ error }}</div>
      <div v-else-if="series.length < 2" class="income-state">交易日数据不足，暂无收益曲线</div>
      <svg v-else viewBox="0 0 520 150" preserveAspectRatio="none" aria-label="累计收益曲线">
        <defs>
          <linearGradient id="income-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#5b8cff" stop-opacity=".24" />
            <stop offset="1" stop-color="#5b8cff" stop-opacity="0" />
          </linearGradient>
        </defs>
        <line v-for="ratio in [0, .5, 1]" :key="ratio" class="grid-line" x1="24" x2="510" :y1="18 + ratio * 108" :y2="18 + ratio * 108" />
        <path class="income-area" :d="areaPath" />
        <path class="income-line" :d="linePath" />
        <text class="axis-label" x="2" y="21">{{ formatCompact(maxValue) }}</text>
        <text class="axis-label" x="2" y="129">{{ formatCompact(minValue) }}</text>
        <text class="axis-label" x="24" y="146">{{ shortDate(series[0]?.date) }}</text>
        <text class="axis-label end" x="510" y="146">{{ shortDate(series[series.length - 1]?.date) }}</text>
      </svg>
    </div>

    <div class="range-switch" role="group" aria-label="收益时间范围">
      <button
        v-for="item in ranges"
        :key="item.value"
        type="button"
        :class="{ active: range === item.value }"
        @click="emit('update:range', item.value)"
      >{{ item.label }}</button>
    </div>

    <div class="details-head"><span>收益明细</span><small>日期 / 收益</small></div>
    <div v-if="detailRows.length" class="income-list">
      <div v-for="row in detailRows" :key="row.date" class="income-row">
        <span>{{ row.date }}</span>
        <small v-if="row.hasAdjustment">调仓日</small>
        <strong v-else-if="row.dailyProfit !== null" :class="profitClass(row.dailyProfit)">{{ formatMoney(row.dailyProfit, true) }}</strong>
        <strong v-else>--</strong>
      </div>
    </div>
    <div v-else class="detail-empty">暂无收益明细</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FundDailySnapshot } from '../../utils/fundLedger'
import { createIncomeSeries, createLinePath, type FundChartRange } from '../../utils/fundChart'

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
const minValue = computed(() => Math.min(...series.value.map((item) => item.value), 0))
const maxValue = computed(() => Math.max(...series.value.map((item) => item.value), 0))
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
.income-card { min-height: 276px; }
.income-header { display: flex; align-items: end; justify-content: space-between; }
.income-header > div { display: flex; align-items: baseline; gap: 8px; }
.income-header span { color: var(--text-muted); font-size: 10px; }
.income-header strong { color: var(--text-primary); font-size: 18px; font-weight: 680; letter-spacing: 0; }
.income-header small { color: var(--text-muted); font-size: 10px; }
.up { color: var(--danger) !important; }
.down { color: var(--success) !important; }
.income-chart { height: 150px; margin-top: 3px; }
.income-chart svg { width: 100%; height: 100%; overflow: visible; }
.income-state { height: 100%; display: grid; place-items: center; color: var(--text-muted); font-size: 11px; }
.income-state.error { color: #f59e55; }
.grid-line { stroke: var(--divider-color); stroke-width: 1; }
.income-area { fill: url(#income-fill); }
.income-line { fill: none; stroke: #5b8cff; stroke-width: 2; vector-effect: non-scaling-stroke; stroke-linecap: round; stroke-linejoin: round; }
.axis-label { fill: var(--text-muted); font-size: 10px; }
.axis-label.end { text-anchor: end; }
.range-switch { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; margin: 1px 0 9px; }
.range-switch button { height: 24px; border: 0; border-radius: 7px; color: var(--text-muted); background: transparent; font: inherit; font-size: 10px; cursor: pointer; }
.range-switch button:hover { color: var(--text-primary); background: var(--card-bg-hover); }
.range-switch button.active { color: #8fb0ff; background: rgba(91, 140, 255, .14); }
.details-head { display: flex; justify-content: space-between; padding: 8px 0 4px; border-top: 1px solid var(--divider-color); color: var(--text-secondary); font-size: 10px; }
.details-head small { color: var(--text-muted); font-size: 10px; }
.income-list { display: grid; align-content: start; padding-bottom: 8px; }
.income-row { display: grid; grid-template-columns: 1fr auto; align-items: center; min-height: 24px; color: var(--text-secondary); font-size: 10px; border-bottom: 1px solid rgba(255, 255, 255, .035); }
.income-row small { padding: 2px 5px; border-radius: 4px; color: #8fb0ff; background: rgba(91, 140, 255, .12); font-size: 10px; }
.income-row strong { color: var(--text-primary); font-size: 10px; }
.detail-empty { padding: 13px 0; text-align: center; color: var(--text-muted); font-size: 10px; }
</style>
