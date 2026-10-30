<template>
  <button
    class="shortcut-recorder"
    :class="{ 'is-recording': isRecording, 'is-empty': !modelValue }"
    type="button"
    :disabled="disabled"
    :aria-label="label"
    @click="handleClick"
    @keydown="handleKeydown"
    @blur="stopRecording"
  >
    <span v-if="isRecording" class="shortcut-recorder__hint">按下组合键…</span>
    <span v-else class="shortcut-recorder__value">{{ formatShortcut(modelValue) }}</span>
  </button>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { captureShortcut, formatShortcut } from '../../utils/shortcut'

const props = defineProps<{
  modelValue: string
  label: string
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
  recording: [value: boolean]
}>()

const isRecording = ref(false)

function startRecording() {
  if (props.disabled || isRecording.value) return
  isRecording.value = true
  emit('recording', true)
}

function stopRecording() {
  if (!isRecording.value) return
  isRecording.value = false
  emit('recording', false)
}

function handleClick() {
  if (isRecording.value) {
    stopRecording()
    return
  }
  startRecording()
}

function handleKeydown(event: KeyboardEvent) {
  if (!isRecording.value) return

  // 录制期间拦截所有按键：既避免触发窗口快捷键，也避免 Escape 直接关掉设置弹窗
  event.preventDefault()
  event.stopPropagation()

  const captured = captureShortcut(event)
  if (captured.type === 'ignore') return
  if (captured.type === 'cancel') {
    stopRecording()
    return
  }
  if (captured.type === 'clear') {
    emit('update:modelValue', '')
    stopRecording()
    return
  }
  if (captured.type === 'invalid') return

  emit('update:modelValue', captured.value)
  stopRecording()
}
</script>

<style scoped>
.shortcut-recorder {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 34px;
  padding: 0 10px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  color: var(--text-primary);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.shortcut-recorder:hover,
.shortcut-recorder:focus-visible {
  border-color: var(--accent);
  outline: none;
}

.shortcut-recorder__value {
  font-family: var(--font-mono);
  font-size: var(--fs-xs);
  letter-spacing: 0.02em;
}

.shortcut-recorder.is-empty .shortcut-recorder__value {
  color: var(--text-muted);
}

.shortcut-recorder.is-recording {
  border-style: solid;
  border-color: var(--accent);
  color: var(--accent-text);
}

.shortcut-recorder__hint {
  font-size: var(--fs-xs);
  color: var(--accent-text);
  animation: shortcut-pulse 1.2s ease-in-out infinite;
}

@keyframes shortcut-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}
</style>
