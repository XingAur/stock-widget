<template>
  <section class="quant-section">
    <h4 class="cl-section-head">因子评分<span class="cl-section-head__sub">（0.7×动量20 + 0.3×反转5，截面分）</span></h4>
    <div
      v-for="row in rows"
      :key="row.code"
      class="cl-card cl-card--static cl-card--row quant-row"
      :class="{ 'is-active': row.rank > 0 && row.rank <= 3 }"
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
