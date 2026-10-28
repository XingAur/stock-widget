<template>
  <header class="stock-header">
    <div class="stock-title">
      <h2>{{ name }}</h2>
      <div class="stock-subtitle">{{ code }} {{ exchangeLabel }}</div>
      <button
        v-if="tags?.length"
        class="stock-tags"
        type="button"
        title="查看所属板块与公告"
        @click="emit('tags-click')"
      >
        <span v-for="tag in tags" :key="tag" class="cl-tag stock-tag">{{ tag }}</span>
      </button>
    </div>
    <div class="price-panel">
      <div class="price-value">{{ priceText }}</div>
      <div class="cl-pill price-pill" :class="[tone, tone === 'up' ? 'cl-pill--rise' : 'cl-pill--fall']">{{ changeText }}</div>
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
const emit = defineEmits<{ (event: 'tags-click'): void }>()

defineProps<{
  name: string
  code: string
  exchangeLabel: string
  priceText: string
  changeText: string
  tone: string
  items: { label: string; value: string; compact?: boolean }[]
  tags?: string[]
}>()
</script>

<style scoped>
.stock-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 0 10px}
.stock-title{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.stock-title h2{margin:0;font-size:20px;line-height:1.08;font-weight:800;color:var(--text-primary)}
.stock-tags{display:inline-flex;flex-wrap:wrap;gap:4px;padding:0;border:0;background:transparent;cursor:pointer;align-self:center}
.stock-tag{height:20px;font-size:10px;transition:background var(--ease),color var(--ease)}
.stock-tags:hover .stock-tag{background:var(--accent-soft);color:var(--accent-text)}
.stock-subtitle{margin-top:0;font-size:var(--fs-md);line-height:1.08;color:var(--text-secondary);white-space:nowrap}
.stock-header,.stats-grid{flex-shrink:0}
.price-panel{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.price-value{font-size:var(--fs-lg);line-height:1;font-weight:650;color:var(--text-primary);font-variant-numeric:tabular-nums}
/* 详情页的涨跌胶囊比列表大一号 */
.price-pill{min-width:92px;padding:6px 12px;font-size:var(--fs-lg);font-weight:800}
.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:8px 0 10px;border-top:1px solid var(--divider-color);border-bottom:1px solid var(--divider-color)}
.stat-item{display:flex;flex-direction:column;gap:4px;padding:6px 12px}
.stat-label{font-size:var(--fs-sm);color:var(--text-muted)}
.stat-value{font-size:var(--fs-xl);font-weight:700;color:var(--text-primary);font-variant-numeric:tabular-nums}
.stat-value :deep(.stat-unit){font-size:var(--fs-sm);font-weight:400;color:var(--text-muted)}
</style>
