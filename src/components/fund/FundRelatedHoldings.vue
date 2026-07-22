<template>
  <section class="allocation-card">
    <div v-if="loading" class="allocation-state">正在读取最新披露...</div>
    <div v-else-if="error && !allocation" class="allocation-state error">{{ error }}</div>
    <template v-else-if="hasData">
      <header class="section-heading">
        <div>
          <span class="eyebrow">FUND EXPOSURE</span>
          <h3>行业配置</h3>
        </div>
        <span class="report-date">报告期 {{ allocation?.reportDate || '--' }}</span>
      </header>

      <div v-if="allocation?.industries.length" class="industry-list">
        <div v-for="industry in allocation.industries.slice(0, 6)" :key="industry.name" class="industry-row">
          <span class="industry-name">{{ industry.name }}</span>
          <div class="industry-track"><i :style="{ width: `${barWidth(industry.percent)}%` }" /></div>
          <strong>{{ industry.percent.toFixed(2) }}%</strong>
        </div>
      </div>
      <p v-else class="sub-empty">暂无行业配置数据</p>

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
      <p v-else class="sub-empty">暂无重仓持股数据</p>
      <p v-if="error" class="stale-warning">{{ error }}，当前展示最近一次缓存</p>
    </template>
    <div v-else class="allocation-state">暂无持仓披露数据</div>
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
.allocation-state { min-height: 248px; display: grid; place-items: center; color: var(--text-muted); font-size: 12px; }
.allocation-state.error, .stale-warning { color: #f59e55; }
.section-heading, .holdings-heading { display: flex; align-items: end; justify-content: space-between; }
.eyebrow { display: block; color: #6f94f8; font-size: 10px; font-weight: 800; letter-spacing: 0; margin-bottom: 2px; }
h3 { color: var(--text-primary); font-size: 13px; font-weight: 650; }
.report-date, .holdings-heading span { color: var(--text-muted); font-size: 10px; }
.industry-list { display: grid; gap: 8px; margin-top: 11px; }
.industry-row { display: grid; grid-template-columns: 80px 1fr 45px; align-items: center; gap: 8px; font-size: 10px; }
.industry-name { overflow: hidden; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; }
.industry-track { height: 5px; overflow: hidden; border-radius: 999px; background: var(--card-bg-hover); }
.industry-track i { display: block; height: 100%; border-radius: inherit; background: linear-gradient(90deg, #5b8cff, #8aa9ff); }
.industry-row strong { text-align: right; color: var(--text-primary); font-size: 10px; }
.holdings-heading { margin: 17px 0 7px; padding-top: 10px; border-top: 1px solid var(--divider-color); }
.holding-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px 16px; }
.holding-item { display: grid; grid-template-columns: 20px 1fr auto; align-items: center; min-width: 0; padding: 5px 0; border-bottom: 1px solid rgba(255, 255, 255, .035); }
.rank { color: #6f94f8; font: 700 10px/1 ui-monospace, monospace; }
.holding-name { min-width: 0; }
.holding-name strong, .holding-name small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.holding-name strong { color: var(--text-secondary); font-size: 10px; font-weight: 550; }
.holding-name small { margin-top: 1px; color: var(--text-muted); font-size: 10px; }
.holding-percent { color: var(--text-primary); font-size: 10px; }
.sub-empty { padding: 16px 0 4px; text-align: center; color: var(--text-muted); font-size: 10px; }
.stale-warning { margin-top: 5px; font-size: 10px; }
</style>
