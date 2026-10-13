<template>
  <div class="tab-bar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      class="tab-btn"
      :class="{ active: activeTab === tab.key }"
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
.tab-bar{display:flex;align-items:center;gap:28px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)}
.tab-btn{position:relative;padding:0;border:none;background:transparent;color:rgba(255,255,255,.72);font-size:14px;font-weight:700;cursor:pointer}
.tab-btn.active{color:#2d9cff}
.tab-btn.active::after{content:'';position:absolute;left:0;right:0;bottom:-11px;height:2px;border-radius:999px;background:#2d9cff}
.chart-meta{display:flex;align-items:center;gap:12px;min-height:28px;padding:12px 0 8px;color:rgba(255,255,255,.74);font-size:12px;flex-wrap:nowrap;overflow:hidden}
</style>
