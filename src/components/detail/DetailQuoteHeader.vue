<template>
  <header class="stock-header">
    <div class="stock-title">
      <h2>{{ name }}</h2>
      <div class="stock-subtitle">{{ code }} {{ exchangeLabel }}</div>
    </div>
    <div class="price-panel">
      <div class="price-value">{{ priceText }}</div>
      <div class="price-pill" :class="tone">{{ changeText }}</div>
    </div>
  </header>
  <section class="stats-grid">
    <div v-for="item in items" :key="item.label" class="stat-item" :class="{ compact: item.compact }">
      <span class="stat-label">{{ item.label }}</span>
      <span class="stat-value" v-html="item.value"></span>
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  name: string
  code: string
  exchangeLabel: string
  priceText: string
  changeText: string
  tone: string
  items: { label: string; value: string; compact?: boolean }[]
}>()
</script>

<style scoped>
.stock-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 0 10px}
.stock-title{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.stock-title h2{margin:0;font-size:20px;line-height:1.08;font-weight:800;color:#fff}
.stock-subtitle{margin-top:0;font-size:13px;line-height:1.08;color:rgba(255,255,255,.68);white-space:nowrap}
.stock-header,.stats-grid{flex-shrink:0}
.price-panel{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.price-value{font-size:14px;line-height:1;font-weight:650;color:var(--text-primary)}
.price-pill{min-width:92px;padding:6px 12px;border-radius:999px;text-align:center;font-size:14px;font-weight:800}
.price-pill.up{color:#ff7474;background:rgba(239,68,68,.14)}
.price-pill.down{color:#3ad283;background:rgba(34,197,94,.12)}
.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:8px 0 10px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.stat-item{display:flex;flex-direction:column;gap:4px;padding:6px 12px}
.stat-item.compact .stat-value{font-size:16px;font-weight:700;color:var(--text-primary)}
.stat-label{font-size:12px;color:var(--text-muted)}
.stat-value{font-size:16px;font-weight:700;color:var(--text-primary)}
</style>
