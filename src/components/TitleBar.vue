<template>
  <!-- 拖动统一由 App.vue 根节点的全局 mousedown 处理（事件冒泡到此），
       这里不再单独绑定，避免同一按下触发两次 start_drag 导致顶部拖动失效 -->
  <header class="cl-titlebar title-bar">
    <div class="cl-traffic window-controls">
      <button class="cl-traffic__btn cl-traffic__btn--close traffic-btn traffic-close" type="button" title="Close" @click.stop="$emit('close')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <button class="cl-traffic__btn cl-traffic__btn--min traffic-btn traffic-minimize" type="button" title="Minimize" @click.stop="$emit('minimize')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button class="cl-traffic__btn cl-traffic__btn--settings traffic-btn traffic-settings" type="button" title="Settings" @click.stop="$emit('settings')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <span class="cl-brand brand-badge">A+</span>
      <button class="cl-titlebar__title app-title" type="button" title="切换股票/基金" @click.stop="$emit('toggleAssetType')">
        {{ displayTitle }}
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  title: string
}>()

defineEmits<{
  close: []
  minimize: []
  settings: []
  toggleAssetType: []
}>()

// 标题形如 "A+Stock Assistant"：A+ 已拆成独立徽标，文字部分去掉前缀
const displayTitle = computed(() => props.title.replace(/^A\+/, '').trim() || props.title)
</script>

<style scoped>
/* 外观全部来自 coolove-ui（cl-titlebar / cl-traffic / cl-brand），这里只保留 A+ 徽标与标题的间距 */
.window-controls {
  gap: 8px;
}

.brand-badge {
  margin-right: -6px;
}

.app-title {
  margin-left: 2px;
}
</style>
