<template>
  <section class="quant-section">
    <h4>组合回测<span>（等权持有 · A股规则 · 约{{ years }}年）</span></h4>
    <div v-if="backtest" class="quant-bt">
      <svg v-if="backtest.nav.length > 1" class="quant-nav" viewBox="0 0 240 60" preserveAspectRatio="none">
        <polyline
          :points="navPoints"
          :class="backtest.totalReturn >= 0 ? 'nav-up' : 'nav-down'"
          fill="none"
          stroke-width="1.5"
        />
      </svg>
      <div class="quant-metrics">
        <div class="metric">
          <span>总收益</span>
          <strong :class="tone(backtest.totalReturn)">{{ percent(backtest.totalReturn) }}</strong>
        </div>
        <div class="metric">
          <span>年化</span>
          <strong :class="tone(backtest.annualizedReturn)">{{ percent(backtest.annualizedReturn) }}</strong>
        </div>
        <div class="metric">
          <span>最大回撤</span>
          <strong class="down">{{ percent(backtest.maxDrawdown) }}</strong>
        </div>
      </div>
      <p class="quant-hint">回测基于后复权日K与等权重平衡（含佣金/印花税/滑点/涨跌停约束），历史表现不代表未来。</p>
    </div>
    <div v-else class="quant-hint">数据不足或加载中</div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { BacktestResult } from '../../utils/quant/types'

const props = defineProps<{ backtest: BacktestResult | null }>()

const years = computed(() => (props.backtest ? Math.max(1, Math.round(props.backtest.nav.length / 244 * 10) / 10) : 0))

const navPoints = computed(() => {
  const nav = props.backtest?.nav ?? []
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

<style scoped>
.quant-section h4{margin:0 0 6px;font-size:11px;font-weight:700;color:var(--text-secondary)}
.quant-section h4 span{font-weight:400;font-size:9px;color:var(--text-muted);margin-left:4px}
.quant-nav{width:100%;height:56px;display:block;margin-bottom:6px}
.nav-up{stroke:#ff7474}
.nav-down{stroke:#3ad283}
.quant-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.metric{display:flex;flex-direction:column;gap:2px;padding:6px 7px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.03)}
.metric span{font-size:9px;color:var(--text-muted)}
.metric strong{font-size:12px;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.metric strong.up{color:#ff7474}
.metric strong.down{color:#3ad283}
.quant-hint{margin:6px 0 0;font-size:10px;line-height:1.5;color:var(--text-muted)}
</style>
