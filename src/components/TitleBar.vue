<template>
  <header class="title-bar" @mousedown="startDrag">
    <div class="window-controls">
      <button class="traffic-btn traffic-close" type="button" title="Close" @click.stop="$emit('close')">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <button class="traffic-btn traffic-minimize" type="button" title="Minimize" @click.stop="$emit('minimize')">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button class="traffic-btn traffic-settings" type="button" title="Settings" @click.stop="$emit('settings')">
        <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33h.01a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.01a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.01a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>
      <button class="app-title" type="button" title="切换股票/基金" @click.stop="$emit('toggleAssetType')">
        {{ title }}
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'

defineProps<{
  title: string
}>()

defineEmits<{
  close: []
  minimize: []
  settings: []
  toggleAssetType: []
}>()

async function startDrag(event: MouseEvent) {
  if ((event.target as HTMLElement).closest('.window-controls')) {
    return
  }

  try {
    await invoke('start_drag')
  } catch (error) {
    console.error('Start drag error:', error)
  }
}
</script>

<style scoped>
.title-bar {
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 10px;
  background: rgba(255, 255, 255, 0.02);
  user-select: none;
}

.window-controls {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.traffic-btn {
  width: 14px;
  height: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 50%;
  cursor: pointer;
  transition: filter 0.15s ease;
  padding: 0;
}

.traffic-btn svg {
  opacity: 0;
  transition: opacity 0.15s ease;
}

.window-controls:hover .traffic-btn svg {
  opacity: 1;
}

.traffic-close {
  background: #ff5f57;
}

.traffic-minimize {
  background: #febc2e;
}

.traffic-settings {
  background: #28c840;
}

.traffic-close:hover {
  filter: brightness(0.85);
}

.traffic-minimize:hover {
  filter: brightness(0.85);
}

.traffic-settings:hover {
  filter: brightness(0.85);
}

.app-title {
  margin-left: 10px;
  padding: 2px 4px;
  border: none;
  border-radius: 6px;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.app-title:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}
</style>
