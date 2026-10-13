<template>
  <section class="allocation-card">
    <div v-if="loading" class="cl-empty allocation-state"><span class="cl-spinner"></span>正在读取最新披露...</div>
    <div v-else-if="error && !allocation" class="cl-empty allocation-state error">{{ error }}</div>
    <template v-else-if="hasData">
      <header class="section-heading">
        <div>
          <span class="cl-eyebrow cl-eyebrow--accent">FUND EXPOSURE</span>
          <h3>行业配置</h3>
        </div>
        <span class="report-date">报告期 {{ allocation?.reportDate || '--' }}</span>
      </header>

      <div v-if="allocation?.industries.length" class="industry-list">
        <div v-for="industry in allocation.industries.slice(0, 6)" :key="industry.name" class="industry-row">
          <span class="industry-name">{{ industry.name }}</span>
          <div class="cl-progress cl-progress--sm industry-track" :style="{ '--val': barWidth(industry.percent) }"><div class="cl-progress__bar" /></div>
          <strong>{{ industry.percent.toFixed(2) }}%</strong>
        </div>
      </div>
      <p v-else class="cl-hint sub-empty">暂无行业配置数据</p>

      <div class="holdings-heading">
        <h3>重仓持股</h3>
        <span>占净值</span>
      </div>
      <div v-if="allocation?.holdings.length" class="holding-grid">
        <div v-for="(holding, index) in allocation.holdings.slice(0, 8)" :key="holding.code" class="holding-item">
          <span class="rank">{{ String(index + 1).padStart(2, '0') }}</span>
          <span class="holding-name"><strong>{{ holding.name }}</strong><small>{{ holding.code }}</small></span>
          <span class="holding-percent">{{ holding.percent.toFixed(2) }}%</span>
        </div>
      </div>
      <p v-else class="cl-hint sub-empty">暂无重仓持股数据</p>
      <p v-if="error" class="cl-hint stale-warning">{{ error }}，当前展示最近一次缓存</p>
    </template>
    <div v-else class="cl-empty allocation-state"><span class="cl-empty__desc">暂无持仓披露数据</span></div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { FundAllocation } from '../../api/stock'

const props = withDefaults(defineProps<{
  allocation: FundAllocation | null
  loading?: boolean
  error?: string
}>(), {
  loading: false,
  error: ''
})

const hasData = computed(() => Boolean(
  props.allocation && (props.allocation.industries.length || props.allocation.holdings.length)
))
const maxIndustryPercent = computed(() => Math.max(
  1,
  ...(props.allocation?.industries.map((industry) => industry.percent) ?? [])
))

function barWidth(percent: number): number {
  return Math.max(3, Math.min(100, percent / maxIndustryPercent.value * 100))
}
</script>

<style scoped>
.allocation-card { min-height: 276px; }
.allocation-state { min-height: 248px; flex-direction: row; font-size: var(--fs-sm); }
.allocation-state.error, .stale-warning { color: var(--c-amber); }
.section-heading, .holdings-heading { display: flex; align-items: end; justify-content: space-between; }
.section-heading .cl-eyebrow { margin-bottom: 2px; }
h3 { color: var(--text-primary); font-size: var(--fs-md); font-weight: 650; }
.report-date, .holdings-heading span { color: var(--text-muted); font-size: 10px; }
.industry-list { display: grid; gap: 8px; margin-top: 11px; }
.industry-row { display: grid; grid-template-columns: 80px 1fr 45px; align-items: center; gap: 8px; font-size: 10px; }
.industry-name { overflow: hidden; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.industry-track { height: 5px; }
.industry-track .cl-progress__bar { background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 60%, #fff)); }
.industry-row strong { text-align: right; color: var(--text-primary); font-size: 10px; font-variant-numeric: tabular-nums; }
.holdings-heading { margin: 17px 0 7px; padding-top: 10px; border-top: 1px solid var(--divider-color); }
.holding-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
.holding-item { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; min-width: 0; padding: 5px 0; border-bottom: 1px solid rgb(var(--ink) / 0.035); }
.rank { color: var(--accent-text); font: 700 10px/1 var(--font-mono); }
.holding-name { min-width: 0; }
.holding-name strong, .holding-name small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.holding-name strong { color: var(--text-secondary); font-size: 10px; font-weight: 550; }
.holding-name small { margin-top: 1px; color: var(--text-muted); font-size: 10px; }
.holding-percent { color: var(--text-primary); font-size: 10px; font-variant-numeric: tabular-nums; }
.sub-empty { padding: 16px 0 4px; text-align: center; }
.stale-warning { margin-top: 5px; }
</style>
