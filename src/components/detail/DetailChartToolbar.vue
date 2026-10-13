<template>
  <div class="cl-tabs tab-bar" role="tablist" aria-label="图表周期">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="cl-tabs__item tab-btn"
      :class="{ active: activeTab === tab.key }"
      role="tab"
      :aria-selected="activeTab === tab.key"
      type="button"
      @click="$emit('switch', tab.key)"
    >
      {{ tab.label }}
    </button>
  </div>
  <div class="chart-meta">
    <slot />
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tabs: { key: string; label: string }[]
  activeTab: string
}>()

defineEmits<{
  switch: [key: string]
}>()
</script>

<style scoped>
/* 标签页外观来自 coolove-ui 的 cl-tabs；详情页标签更宽松一些 */
.tab-bar{gap:12px}
.tab-btn{font-size:var(--fs-lg)}
.chart-meta{display:flex;align-items:center;gap:12px;min-height:28px;padding:12px 0 8px;color:var(--text-secondary);font-size:var(--fs-sm);flex-wrap:nowrap;overflow:hidden}
.chart-meta :deep(.cl-legend){flex-wrap:nowrap;gap:12px;font-size:var(--fs-sm);color:var(--text-secondary)}
</style>
