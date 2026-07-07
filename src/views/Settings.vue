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
          <input type="checkbox" :checked="settings.settings.alwaysOnTop" :disabled="pendingKeys.alwaysOnTop" @change="toggleAlwaysOnTop">
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
          <input type="checkbox" :checked="settings.settings.autoStart" :disabled="pendingKeys.autoStart" @change="toggleAutoStart">
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

      <!-- 主题选择 -->
      <div class="setting-item-vertical">
        <div class="setting-info">
          <span class="setting-label">主题颜色</span>
          <span class="setting-desc">选择预设主题或自定义配色</span>
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
            <span>浅色</span>
          </button>
          <button
            class="theme-btn"
            :class="{ active: settings.settings.theme === 'dark' }"
            @click="setTheme('dark')"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <span>深色</span>
          </button>
          <button
            class="theme-btn custom-btn"
            :class="{ active: settings.settings.theme === 'custom' }"
            @click="setTheme('custom')"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="13.5" cy="6.5" r="2.5"></circle>
              <circle cx="17.5" cy="10.5" r="2.5" opacity="0.5"></circle>
              <circle cx="8.5" cy="7.5" r="2.5" opacity="0.5"></circle>
              <circle cx="6.5" cy="12.5" r="2.5"></circle>
              <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12c0 1.787.472 3.464 1.298 4.914"></path>
            </svg>
            <span>自定义</span>
          </button>
        </div>

        <!-- 自定义配色面板 -->
        <div class="custom-panel" v-show="settings.settings.theme === 'custom'">
          <div class="color-row">
            <div class="color-info">
              <span class="color-label">背景颜色</span>
              <span class="color-hex">{{ settings.settings.customBgColor }}</span>
            </div>
            <input
              type="color"
              class="color-picker"
              :value="settings.settings.customBgColor"
              @input="setBgColor($event)"
            />
          </div>
          <div class="color-row">
            <div class="color-info">
              <span class="color-label">字体颜色</span>
              <span class="color-hex">{{ settings.settings.customFontColor }}</span>
            </div>
            <input
              type="color"
              class="color-picker"
              :value="settings.settings.customFontColor"
              @input="setFontColor($event)"
            />
          </div>
        </div>
      </div>

      <div class="divider"></div>

      <!-- 字体选择 -->
      <div class="setting-item-vertical">
        <div class="setting-info">
          <span class="setting-label">字体样式</span>
          <span class="setting-desc">选择界面使用的字体</span>
        </div>
        <div class="font-preview" :style="{ fontFamily: settings.settings.fontFamily }">
          Aa 股票行情 Stock 123
        </div>
        <select
          class="font-select"
          :value="settings.settings.fontFamily"
          @change="setFontFamily($event)"
        >
          <option v-for="font in fonts" :key="font.value" :value="font.value" :style="{ fontFamily: font.value }">
            {{ font.label }}
          </option>
        </select>
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
      <button class="reset-btn" :disabled="pendingKeys.reset" @click="handleReset">恢复默认</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { useSettingsStore, FONT_OPTIONS } from '../stores/settings'
import {
  resetSettingsWithEffects,
  toggleAlwaysOnTopWithEffect,
  toggleAutoStartWithEffect
} from '../utils/settingsActions'

defineEmits<{
  close: []
}>()

const settings = useSettingsStore()

const fonts = FONT_OPTIONS
const pendingKeys = ref<Partial<Record<'alwaysOnTop' | 'autoStart' | 'reset', boolean>>>({})

function setPending(key: 'alwaysOnTop' | 'autoStart' | 'reset', value: boolean) {
  pendingKeys.value = {
    ...pendingKeys.value,
    [key]: value
  }
}

async function toggleAlwaysOnTop() {
  if (pendingKeys.value.alwaysOnTop) return

  setPending('alwaysOnTop', true)
  try {
    await toggleAlwaysOnTopWithEffect(settings, invoke)
  } catch (e) {
    console.error('Set always on top error:', e)
  } finally {
    setPending('alwaysOnTop', false)
  }
}

async function toggleAutoStart() {
  if (pendingKeys.value.autoStart) return

  setPending('autoStart', true)
  try {
    await toggleAutoStartWithEffect(settings, invoke)
  } catch (e) {
    console.error('Set auto start error:', e)
  } finally {
    setPending('autoStart', false)
  }
}

function toggleMinimizeToTray() {
  settings.updateSettings('minimizeToTray', !settings.settings.minimizeToTray)
}

function setTheme(theme: 'dark' | 'light' | 'custom') {
  settings.updateSettings('theme', theme)
}

function setBgColor(value: string | Event) {
  const color = typeof value === 'string' ? value : (value.target as HTMLInputElement).value
  settings.updateSettings('customBgColor', color)
}

function setFontColor(value: string | Event) {
  const color = typeof value === 'string' ? value : (value.target as HTMLInputElement).value
  settings.updateSettings('customFontColor', color)
}

function setOpacity(event: Event) {
  const target = event.target as HTMLInputElement
  settings.updateSettings('backgroundOpacity', parseFloat(target.value))
}

function setFontFamily(event: Event) {
  const target = event.target as HTMLSelectElement
  settings.updateSettings('fontFamily', target.value)
}

function toggleShowIndices() {
  settings.updateSettings('showIndices', !settings.settings.showIndices)
}

function toggleShowSparklines() {
  settings.updateSettings('showSparklines', !settings.settings.showSparklines)
}

async function handleReset() {
  if (pendingKeys.value.reset) return

  setPending('reset', true)
  try {
    await resetSettingsWithEffects(settings, invoke)
  } catch (e) {
    console.error('Reset settings error:', e)
  } finally {
    setPending('reset', false)
  }
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

.switch input:disabled + .slider {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Theme buttons */
.theme-buttons {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.theme-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--input-bg);
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
  font-size: 12px;
  font-weight: 500;
}

.theme-btn:hover {
  background: var(--card-bg-hover);
  color: var(--text-primary);
}

.theme-btn.active {
  background: var(--accent);
  color: #ffffff;
  border-color: var(--accent);
}

.theme-btn.active:hover {
  color: #ffffff;
}

/* Custom color panel */
.custom-panel {
  margin-top: 12px;
  padding: 12px;
  background: var(--card-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.color-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.color-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.color-label {
  font-size: 12px;
  color: var(--text-primary);
  font-weight: 500;
}

.color-hex {
  font-size: 11px;
  color: var(--text-muted);
  font-family: 'SF Mono', 'Menlo', monospace;
  text-transform: uppercase;
}

.color-picker {
  -webkit-appearance: none;
  appearance: none;
  width: 32px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  cursor: pointer;
  background: transparent;
  padding: 0;
}

.color-picker::-webkit-color-swatch-wrapper {
  padding: 0;
}

.color-picker::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
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

.reset-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

/* Font selector */
.font-preview {
  margin-top: 8px;
  padding: 10px 12px;
  background: var(--solid-bg);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  font-size: 16px;
  color: var(--text-primary);
  line-height: 1.4;
}

.font-select {
  margin-top: 8px;
  width: 100%;
  padding: 8px 10px;
  padding-right: 30px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--solid-bg);
  color: var(--text-primary);
  font-size: 13px;
  cursor: pointer;
  outline: none;
  transition: border-color 0.15s;
  -webkit-appearance: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23888' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
}

.font-select option {
  background: var(--solid-bg);
  color: var(--text-primary);
  padding: 6px 10px;
}

.font-select:hover {
  border-color: var(--accent);
}

.font-select:focus {
  border-color: var(--accent);
}
</style>
