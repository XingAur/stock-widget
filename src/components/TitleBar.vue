<template>
  <header class="title-bar">
    <div class="window-dots">
      <button class="dot close" @click="$emit('close')"></button>
      <button class="dot minimize" @click="$emit('minimize')"></button>
      <button class="dot settings" @click="$emit('settings')"></button>
    </div>
    <div class="title" @mousedown="startDrag">小A助手</div>
  </header>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'

defineEmits<{
  close: []
  minimize: []
  settings: []
}>()

async function startDrag(e: MouseEvent) {
  if ((e.target as HTMLElement).closest('.window-dots')) {
    return
  }
  try {
    await invoke('start_drag')
  } catch (e) {
    console.error('Start drag error:', e)
  }
}
</script>

<style scoped>
.title-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px 16px 8px;
  user-select: none;
}

.window-dots {
  display: flex;
  gap: 8px;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: none;
  cursor: pointer;
  transition: opacity 0.15s;
}

.dot:hover {
  opacity: 0.8;
}

.dot.close {
  background: #ff5f57;
}

.dot.minimize {
  background: #febc2e;
}

.dot.settings {
  background: #28c840;
}

.title {
  flex: 1;
  text-align: center;
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
  cursor: move;
  padding-right: 48px;
}
</style>
