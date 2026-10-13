<template>
  <div class="cl-statusbar__actions bottom-actions">
    <button class="cl-iconbtn cl-iconbtn--accent import-btn" type="button" title="图片导入持仓" @click.stop="$emit('import')">
      <ImagePlus aria-hidden="true" />
    </button>
    <input ref="fileInput" class="import-file-input" type="file" accept="image/*" hidden @change="$emit('file', $event)" />
    <button class="cl-iconbtn cl-iconbtn--accent market-btn" type="button" title="市场助手" @click.stop="$emit('market')">
      <Globe aria-hidden="true" />
    </button>
    <span
      v-if="refreshError"
      class="cl-badge refresh-status"
      :class="stale ? 'cl-badge--warning stale' : 'cl-badge--danger'"
      role="status"
      aria-live="polite"
      :title="refreshError"
    >{{ stale ? '延迟' : '失败' }}</span>
    <button class="cl-iconbtn refresh-btn" type="button" title="刷新" @click.stop="$emit('refresh')">
      <RotateCw aria-hidden="true" />
    </button>
    <span class="cl-statusbar__time update-time" :class="[freshnessLevel, timeClass]" :title="freshnessTitle">{{ freshnessText }}</span>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Globe, ImagePlus, RotateCw } from 'lucide-vue-next'

const props = defineProps<{
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

const timeClass = computed(() => props.freshnessLevel === 'delayed' ? 'is-delayed' : props.freshnessLevel === 'stale' ? 'is-stale' : '')
const fileInput = ref<HTMLInputElement | null>(null)
defineExpose({
  pickFile() {
    fileInput.value?.click()
  }
})
</script>
