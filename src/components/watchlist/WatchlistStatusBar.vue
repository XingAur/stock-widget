<template>
  <div class="bottom-actions">
    <button class="import-btn" type="button" title="图片导入持仓" @click.stop="$emit('import')">
      <ImagePlus :size="14" aria-hidden="true" />
    </button>
    <input ref="fileInput" class="import-file-input" type="file" accept="image/*" @change="$emit('file', $event)" />
    <button class="market-btn" type="button" title="市场助手" @click.stop="$emit('market')">
      <Globe :size="14" aria-hidden="true" />
    </button>
    <span
      v-if="refreshError"
      class="refresh-status"
      :class="{ stale }"
      role="status"
      aria-live="polite"
      :title="refreshError"
    >{{ stale ? '延迟' : '失败' }}</span>
    <button class="refresh-btn" type="button" title="刷新" @click.stop="$emit('refresh')">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </svg>
    </button>
    <span class="update-time" :class="freshnessLevel" :title="freshnessTitle">{{ freshnessText }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { Globe, ImagePlus } from 'lucide-vue-next'

defineProps<{
  refreshError: string
  stale: boolean
  freshnessLevel: string
  freshnessTitle?: string
  freshnessText: string
}>()

defineEmits<{
  import: []
  file: [event: Event]
  market: []
  refresh: []
}>()

const fileInput = ref<HTMLInputElement | null>(null)
defineExpose({
  pickFile() {
    fileInput.value?.click()
  }
})
</script>

<style scoped>
.bottom-actions{display:inline-flex;align-items:center;gap:6px;flex-shrink:0}
.import-btn,.market-btn,.refresh-btn{width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:transparent;color:var(--text-muted);cursor:pointer}
.import-btn:hover,.market-btn:hover{color:#5da8ff;background:rgba(45,124,246,.14)}
.refresh-btn:hover{color:var(--text-primary);background:rgba(255,255,255,.05)}
.import-file-input{display:none}
.refresh-status{display:inline-flex;align-items:center;height:20px;padding:0 5px;border:1px solid rgba(248,113,113,.3);border-radius:5px;background:rgba(248,113,113,.09);color:#ff8c8c;font-size:9px;font-weight:700;white-space:nowrap}
.refresh-status.stale{border-color:rgba(245,158,11,.28);background:rgba(245,158,11,.08);color:#fbbf57}
.update-time{font-size:11px;color:var(--text-muted)}.update-time.delayed{color:#fbbf57}.update-time.stale{color:#f59e0b}
</style>
