<template>
  <section class="quant-section">
    <h4>因子评分<span>（0.7×动量20 + 0.3×反转5，截面分）</span></h4>
    <div
      v-for="row in rows"
      :key="row.code"
      class="quant-row"
      :class="{ active: row.rank > 0 && row.rank <= 3 }"
    >
      <span class="quant-rank">{{ row.rank > 0 ? row.rank : '-' }}</span>
      <span class="quant-name" :title="row.name">{{ row.name }}</span>
      <span class="quant-mom" :class="tone(row.mom20)">{{ percent(row.mom20) }}</span>
      <span class="quant-score" :class="scoreTone(row.composite)">{{ scoreText(row.composite) }}</span>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { FactorRow } from '../../utils/quant/types'

defineProps<{
  rows: (FactorRow & { name: string })[]
}>()

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

function scoreTone(value: number | null): string {
  if (value === null) {
    return ''
  }
  return value > 0.5 ? 'up' : value < -0.5 ? 'down' : ''
}

function scoreText(value: number | null): string {
  if (value === null) {
    return '--'
  }
  return value.toFixed(2)
}
</script>

<style scoped>
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
</style>
