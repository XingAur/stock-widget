<template>
  <div class="settings-view">
    <header class="settings-header">
      <h2>设置</h2>
      <button class="close-btn" @click="$emit('close')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </header>

    <div class="settings-content">
      <!-- 窗口置顶 -->
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">窗口置顶</span>
          <span class="setting-desc">始终显示在其他窗口上方</span>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.settings.alwaysOnTop" @change="toggleAlwaysOnTop">
          <span class="slider"></span>
        </label>
      </div>

      <div class="divider"></div>

      <!-- 开机自启 -->
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">开机自启</span>
          <span class="setting-desc">开机时自动启动小组件</span>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.settings.autoStart" @change="toggleAutoStart">
          <span class="slider"></span>
        </label>
      </div>

      <div class="divider"></div>

      <!-- 最小化到托盘 -->
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">最小化到托盘</span>
          <span class="setting-desc">点击最小化按钮缩到系统托盘</span>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.settings.minimizeToTray" @change="toggleMinimizeToTray">
          <span class="slider"></span>
        </label>
      </div>

      <div class="divider"></div>

      <!-- 深色模式 -->
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">深色模式</span>
          <span class="setting-desc">切换界面至深色/浅色主题</span>
        </div>
        <div class="theme-buttons">
          <button
            class="theme-btn"
            :class="{ active: settings.settings.theme === 'light' }"
            @click="setTheme('light')"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          </button>
          <button
            class="theme-btn"
            :class="{ active: settings.settings.theme === 'dark' }"
            @click="setTheme('dark')"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          </button>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 背景透明度 -->
      <div class="setting-item-vertical">
        <div class="setting-header-row">
          <span class="setting-label">背景透明度</span>
          <span class="opacity-value">{{ Math.round(settings.settings.backgroundOpacity * 100) }}%</span>
        </div>
        <span class="setting-desc">调节窗口背景透明度</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          :value="settings.settings.backgroundOpacity"
          @input="setOpacity($event)"
          class="opacity-slider"
        />
      </div>

      <div class="divider"></div>

      <!-- 显示大盘指数 -->
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">显示大盘指数</span>
          <span class="setting-desc">显示上证、深证、创业板指数</span>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.settings.showIndices" @change="toggleShowIndices">
          <span class="slider"></span>
        </label>
      </div>

      <div class="divider"></div>

      <!-- 显示分时折线图 -->
      <div class="setting-item">
        <div class="setting-info">
          <span class="setting-label">显示分时折线图</span>
          <span class="setting-desc">在股票列表中显示迷你折线图</span>
        </div>
        <label class="switch">
          <input type="checkbox" :checked="settings.settings.showSparklines" @change="toggleShowSparklines">
          <span class="slider"></span>
        </label>
      </div>
    </div>

    <footer class="settings-footer">
      <button class="reset-btn" @click="settings.reset">恢复默认</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore } from '../stores/settings'

defineEmits<{
  close: []
}>()

const settings = useSettingsStore()

async function toggleAlwaysOnTop() {
  const newValue = !settings.settings.alwaysOnTop
  settings.updateSettings('alwaysOnTop', newValue)
  try {
    await invoke('set_always_on_top', { enabled: newValue })
  } catch (e) {
    console.error('Set always on top error:', e)
  }
}

async function toggleAutoStart() {
  const newValue = !settings.settings.autoStart
  settings.updateSettings('autoStart', newValue)
  try {
    await invoke('set_auto_start', { enabled: newValue })
  } catch (e) {
    console.error('Set auto start error:', e)
  }
}

function toggleMinimizeToTray() {
  settings.updateSettings('minimizeToTray', !settings.settings.minimizeToTray)
}

function setTheme(theme: 'dark' | 'light') {
  settings.updateSettings('theme', theme)
}

function setOpacity(event: Event) {
  const target = event.target as HTMLInputElement
  settings.updateSettings('backgroundOpacity', parseFloat(target.value))
}

function toggleShowIndices() {
  settings.updateSettings('showIndices', !settings.settings.showIndices)
}

function toggleShowSparklines() {
  settings.updateSettings('showSparklines', !settings.settings.showSparklines)
}
</script>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 16px 12px;
}

.settings-header h2 {
  font-size: 16px;
  font-weight: 500;
  color: var(--text-primary);
}

.close-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.close-btn:hover {
  background: rgba(239, 68, 68, 0.15);
  color: var(--danger);
}

.settings-content {
  flex: 1;
  padding: 0 16px;
  overflow-y: auto;
}

.setting-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 0;
}

.setting-item-vertical {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 4px 0;
}

.setting-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.setting-info {
  display: flex;
  flex-direction: column;
}

.setting-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.setting-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

/* Divider */
.divider {
  height: 1px;
  background: var(--divider-color);
  margin: 12px 0;
}

/* Toggle Switch */
.switch {
  position: relative;
  width: 44px;
  height: 24px;
  flex-shrink: 0;
}

.switch input {
  opacity: 0;
  width: 0;
  height: 0;
}

.slider {
  position: absolute;
  cursor: pointer;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--input-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  transition: 0.2s;
}

.slider:before {
  position: absolute;
  content: "";
  height: 18px;
  width: 18px;
  left: 2px;
  bottom: 2px;
  background: var(--text-muted);
  border-radius: 50%;
  transition: 0.2s;
}

input:checked + .slider {
  background: var(--accent);
  border-color: var(--accent);
}

input:checked + .slider:before {
  transform: translateX(20px);
  background: #ffffff;
}

/* Theme buttons */
.theme-buttons {
  display: flex;
  gap: 8px;
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--input-bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.theme-btn:hover {
  background: var(--card-bg-hover);
}

.theme-btn.active {
  background: var(--accent);
  color: #ffffff;
}

/* Opacity slider */
.opacity-value {
  font-size: 14px;
  font-weight: 500;
  color: var(--accent);
}

.opacity-slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: var(--input-bg);
  outline: none;
  -webkit-appearance: none;
  cursor: pointer;
  margin-top: 8px;
}

.opacity-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
  border: 2px solid var(--window-bg);
  box-shadow: 0 1px 4px rgba(0,0,0,0.3);
}

.opacity-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

/* Footer */
.settings-footer {
  padding: 16px;
  padding-top: 12px;
}

.reset-btn {
  width: 100%;
  padding: 10px;
  border-radius: var(--radius);
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.reset-btn:hover {
  background: var(--card-bg-hover);
  border-color: var(--accent);
}
</style>
