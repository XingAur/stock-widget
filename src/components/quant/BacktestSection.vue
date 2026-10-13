<template>
  <section class="quant-section">
    <h4 class="cl-section-head">回测对照<span class="cl-section-head__sub">等权基准 vs {{ strategyLabel }} · 约{{ years }}年</span></h4>
    <div v-if="backtest" class="quant-bt">
      <svg v-if="backtest.nav.length > 1" class="quant-nav" viewBox="0 0 240 60" preserveAspectRatio="none">
        <polyline
          v-if="strategyPoints"
          :points="strategyPoints"
          class="cl-chart__line nav-strategy"
        />
        <polyline
          :points="navPoints"
          class="cl-chart__line"
          :class="backtest.totalReturn >= 0 ? 'nav-up' : 'nav-down'"
        />
      </svg>
      <div class="cl-stat-grid quant-metrics">
        <div class="cl-stat cl-stat--compact metric">
          <span class="cl-stat__label">等权收益</span>
          <strong class="cl-stat__value" :class="tone(backtest.totalReturn)">{{ percent(backtest.totalReturn) }}</strong>
        </div>
        <div class="cl-stat cl-stat--compact metric">
          <span class="cl-stat__label">{{ strategyLabel }}收益</span>
          <strong class="cl-stat__value" :class="tone(strategy?.totalReturn)">{{ percent(strategy?.totalReturn) }}</strong>
        </div>
        <div class="cl-stat cl-stat--compact metric">
          <span class="cl-stat__label">等权回撤</span>
          <strong class="cl-stat__value down">{{ percent(backtest.maxDrawdown) }}</strong>
        </div>
      </div>
      <p class="cl-hint quant-hint">浅线等权基准，深线为周频 Top-N（信号用上一交易日及之前数据，次日开盘成交）。当前名单是固定自选池，不是点时沪深300。{{ icText }}成本已计入；换手 {{ turnoverText }}。</p>
    </div>
    <div v-else class="cl-hint quant-hint">数据不足或加载中</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BacktestResult } from '../../utils/quant/types'

const props = defineProps<{
  backtest: BacktestResult | null
  strategy?: BacktestResult | null
  strategyLabel?: string
  icMean?: number | null
}>()

const strategyLabel = computed(() => props.strategyLabel || 'Top-N')
const years = computed(() => (props.backtest ? Math.max(1, Math.round(props.backtest.nav.length / 244 * 10) / 10) : 0))

function polyline(nav: { value: number }[]): string {
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
}

const icText = computed(() => (typeof props.icMean === 'number' && Number.isFinite(props.icMean) ? 'Rank IC ' + (props.icMean >= 0 ? '+' : '') + props.icMean.toFixed(3) + '。' : ''))
const turnoverText = computed(() => {
  const value = props.strategy?.turnover
  return typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '--'
})
const navPoints = computed(() => polyline(props.backtest?.nav ?? []))
const strategyPoints = computed(() => polyline(props.strategy?.nav ?? []))

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--'
  }
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function tone(value: number | null | undefined): string {
  if (value === null || value === undefined || value === 0) {
    return ''
  }
  return value > 0 ? 'up' : 'down'
}
</script>
