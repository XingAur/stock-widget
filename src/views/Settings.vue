<template>
  <div class="settings-view">
    <header class="cl-dialog__head settings-header">
      <h2 class="cl-dialog__title">设置</h2>
      <button class="cl-close close-btn" type="button" aria-label="关闭设置" @click="$emit('close')">
        <X aria-hidden="true" />
      </button>
    </header>

    <div class="cl-dialog__body cl-scroll settings-content">
      <!-- 窗口置顶 -->
      <div class="cl-setting setting-item">
        <div class="cl-setting__info">
          <span class="cl-setting__label">窗口置顶</span>
          <span class="cl-setting__desc">始终显示在其他窗口上方</span>
        </div>
        <label class="cl-switch">
          <input type="checkbox" aria-label="窗口置顶" :checked="settings.settings.alwaysOnTop" :disabled="pendingKeys.alwaysOnTop" @change="toggleAlwaysOnTop">
          <span class="cl-switch__track"></span>
        </label>
      </div>

      <hr class="cl-divider">

      <!-- 开机自启 -->
      <div class="cl-setting setting-item">
        <div class="cl-setting__info">
          <span class="cl-setting__label">开机自启</span>
          <span class="cl-setting__desc">开机时自动启动小组件</span>
        </div>
        <label class="cl-switch">
          <input type="checkbox" aria-label="开机自启" :checked="settings.settings.autoStart" :disabled="pendingKeys.autoStart" @change="toggleAutoStart">
          <span class="cl-switch__track"></span>
        </label>
      </div>

      <hr class="cl-divider">

      <!-- 最小化到托盘 -->
      <div class="cl-setting setting-item">
        <div class="cl-setting__info">
          <span class="cl-setting__label">最小化到托盘</span>
          <span class="cl-setting__desc">点击最小化按钮缩到系统托盘</span>
        </div>
        <label class="cl-switch">
          <input type="checkbox" aria-label="最小化到托盘" :checked="settings.settings.minimizeToTray" @change="toggleMinimizeToTray">
          <span class="cl-switch__track"></span>
        </label>
      </div>

      <hr class="cl-divider">

      <!-- 主题选择 -->
      <div class="cl-stack setting-item-vertical">
        <div class="cl-setting__info">
          <span class="cl-setting__label">主题颜色</span>
          <span class="cl-setting__desc">选择预设主题或自定义配色</span>
        </div>
        <div class="cl-segmented cl-segmented--block theme-buttons" role="group" aria-label="主题颜色">
          <button
            class="cl-segmented__item theme-btn"
            type="button"
            :aria-pressed="settings.settings.theme === 'light'"
            @click="setTheme('light')"
          >
            <Sun aria-hidden="true" />
            <span>浅色</span>
          </button>
          <button
            class="cl-segmented__item theme-btn"
            type="button"
            :aria-pressed="settings.settings.theme === 'dark'"
            @click="setTheme('dark')"
          >
            <Moon aria-hidden="true" />
            <span>深色</span>
          </button>
          <button
            class="cl-segmented__item theme-btn custom-btn"
            type="button"
            :aria-pressed="settings.settings.theme === 'custom'"
            @click="setTheme('custom')"
          >
            <Palette aria-hidden="true" />
            <span>自定义</span>
          </button>
        </div>

        <!-- 自定义配色面板 -->
        <div v-show="settings.settings.theme === 'custom'" class="cl-panel cl-stack custom-panel">
          <label class="cl-setting color-row">
            <span class="cl-setting__info">
              <span class="cl-setting__label color-label">背景颜色</span>
              <span class="cl-mono cl-muted color-hex">{{ settings.settings.customBgColor }}</span>
            </span>
            <input
              type="color"
              aria-label="背景颜色"
              class="cl-color color-picker"
              :value="settings.settings.customBgColor"
              @input="setBgColor($event)"
            />
          </label>
          <label class="cl-setting color-row">
            <span class="cl-setting__info">
              <span class="cl-setting__label color-label">字体颜色</span>
              <span class="cl-mono cl-muted color-hex">{{ settings.settings.customFontColor }}</span>
            </span>
            <input
              type="color"
              aria-label="字体颜色"
              class="cl-color color-picker"
              :value="settings.settings.customFontColor"
              @input="setFontColor($event)"
            />
          </label>
        </div>
      </div>

      <hr class="cl-divider">

      <!-- 字体选择 -->
      <div class="cl-stack setting-item-vertical">
        <div class="cl-setting__info">
          <span class="cl-setting__label">字体样式</span>
          <span class="cl-setting__desc">选择界面使用的字体</span>
        </div>
        <div class="cl-panel font-preview" :style="{ fontFamily: settings.settings.fontFamily }">
          Aa 股票行情 Stock 123
        </div>
        <select
          class="cl-select font-select"
          aria-label="字体样式"
          :value="settings.settings.fontFamily"
          @change="setFontFamily($event)"
        >
          <option v-for="font in fonts" :key="font.value" :value="font.value" :style="{ fontFamily: font.value }">
            {{ font.label }}
          </option>
        </select>
      </div>

      <hr class="cl-divider">

      <!-- 背景透明度 -->
      <div class="setting-item-vertical">
        <div class="cl-setting">
          <div class="cl-setting__info">
            <span class="cl-setting__label">背景透明度</span>
            <span class="cl-setting__desc">调节窗口背景透明度，弹窗和菜单不受影响</span>
          </div>
          <span class="cl-setting__value opacity-value">{{ opacityPercent }}%</span>
        </div>
        <input
          type="range"
          aria-label="背景透明度"
          min="0"
          max="1"
          step="0.05"
          :value="settings.settings.backgroundOpacity"
          :style="{ '--val': opacityPercent }"
          class="cl-range opacity-slider"
          @input="setOpacity($event)"
        />
      </div>

      <hr class="cl-divider">

      <!-- 显示大盘指数 -->
      <div class="cl-setting setting-item">
        <div class="cl-setting__info">
          <span class="cl-setting__label">显示大盘指数</span>
          <span class="cl-setting__desc">显示上证、深证、创业板指数</span>
        </div>
        <label class="cl-switch">
          <input type="checkbox" aria-label="显示大盘指数" :checked="settings.settings.showIndices" @change="toggleShowIndices">
          <span class="cl-switch__track"></span>
        </label>
      </div>

      <hr class="cl-divider">

      <!-- 显示分时折线图 -->
      <div class="cl-setting setting-item">
        <div class="cl-setting__info">
          <span class="cl-setting__label">显示分时折线图</span>
          <span class="cl-setting__desc">在股票列表中显示迷你折线图</span>
        </div>
        <label class="cl-switch">
          <input type="checkbox" aria-label="显示分时折线图" :checked="settings.settings.showSparklines" @change="toggleShowSparklines">
          <span class="cl-switch__track"></span>
        </label>
      </div>
    </div>

    <footer class="cl-dialog__foot settings-footer">
      <button class="cl-btn cl-btn--block cl-btn--lg reset-btn" type="button" :disabled="pendingKeys.reset" @click="handleReset">恢复默认</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { Moon, Palette, Sun, X } from 'lucide-vue-next'
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
const opacityPercent = computed(() => Math.round(settings.settings.backgroundOpacity * 100))
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
/* 控件外观来自 coolove-ui（cl-setting / cl-switch / cl-segmented / cl-range），这里只排布对话框内的三段结构 */
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-header {
  padding: 16px 14px 8px 16px;
}

.settings-content {
  flex: 1;
  min-height: 0;
  padding-bottom: 8px;
}

.settings-content .cl-divider {
  margin: 10px 0;
}

.setting-item-vertical {
  gap: 8px;
}

.font-preview {
  padding: 10px 12px;
  font-size: 16px;
  line-height: 1.4;
}

.settings-footer {
  padding-top: 12px;
  border-top: 1px solid var(--divider-color);
}
</style>
