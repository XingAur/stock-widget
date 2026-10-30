<template>
  <div class="settings-view">
    <header class="cl-dialog__head settings-header">
      <h2 class="cl-dialog__title">设置</h2>
      <button class="cl-close close-btn" type="button" aria-label="关闭设置" @click="handleClose">
        <X aria-hidden="true" />
      </button>
    </header>

    <div class="cl-dialog__body cl-scroll settings-content">
      <!-- 窗口行为 -->
      <section class="settings-section">
        <h3 class="cl-section-head settings-section-title"><AppWindow :size="13" aria-hidden="true" />窗口</h3>
        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">窗口置顶</span>
              <span class="cl-setting__desc">始终显示在其他窗口上方</span>
            </div>
            <label class="cl-switch">
              <input type="checkbox" aria-label="窗口置顶" :checked="settings.settings.alwaysOnTop" :disabled="pendingKeys.alwaysOnTop" @change="toggleAlwaysOnTop">
              <span class="cl-switch__track"></span>
            </label>
          </div>
          <div class="cl-setting settings-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">开机自启</span>
              <span class="cl-setting__desc">开机时自动启动小组件</span>
            </div>
            <label class="cl-switch">
              <input type="checkbox" aria-label="开机自启" :checked="settings.settings.autoStart" :disabled="pendingKeys.autoStart" @change="toggleAutoStart">
              <span class="cl-switch__track"></span>
            </label>
          </div>
          <div class="cl-setting settings-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">最小化到托盘</span>
              <span class="cl-setting__desc">点击最小化按钮缩到系统托盘</span>
            </div>
            <label class="cl-switch">
              <input type="checkbox" aria-label="最小化到托盘" :checked="settings.settings.minimizeToTray" @change="toggleMinimizeToTray">
              <span class="cl-switch__track"></span>
            </label>
          </div>
        </div>
      </section>

      <!-- 贴边位置 -->
      <section class="settings-section">
        <h3 class="cl-section-head settings-section-title"><Move :size="13" aria-hidden="true" />窗口位置</h3>
        <div class="corner-grid" role="group" aria-label="窗口贴边位置">
          <button
            v-for="corner in corners"
            :key="corner.value"
            class="corner-btn"
            :class="{ 'is-active': activeCorner === corner.value }"
            type="button"
            :aria-label="`贴靠${corner.label}`"
            :aria-pressed="activeCorner === corner.value"
            @click="snapToCorner(corner.value)"
          >
            <component :is="corner.icon" :size="15" aria-hidden="true" />
            <span>{{ corner.label }}</span>
          </button>
        </div>
        <p class="settings-hint">{{ cornerError || '点击后窗口贴到屏幕对应角落（自动避开任务栏）' }}</p>
      </section>

      <!-- 全局快捷键 -->
      <section class="settings-section">
        <h3 class="cl-section-head settings-section-title"><Keyboard :size="13" aria-hidden="true" />快捷键</h3>
        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row shortcut-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">打开窗口</span>
              <span class="cl-setting__desc">在任意应用里按下即可唤出</span>
            </div>
            <ShortcutRecorder
              :model-value="settings.settings.showShortcut"
              label="打开窗口快捷键"
              @update:model-value="updateShortcut('showShortcut', $event)"
              @recording="handleShortcutRecording"
            />
          </div>
          <div class="cl-setting settings-row shortcut-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">隐藏窗口</span>
              <span class="cl-setting__desc">按下后把组件收进托盘</span>
            </div>
            <ShortcutRecorder
              :model-value="settings.settings.hideShortcut"
              label="隐藏窗口快捷键"
              @update:model-value="updateShortcut('hideShortcut', $event)"
              @recording="handleShortcutRecording"
            />
          </div>
        </div>
        <p class="settings-hint" :class="{ 'is-error': shortcutError }">
          {{ shortcutError || '点击快捷键后按下新组合（需含 Ctrl / Alt / Shift / Win，Delete 清除）' }}
        </p>
      </section>

      <!-- 外观 -->
      <section class="settings-section">
        <h3 class="cl-section-head settings-section-title"><Palette :size="13" aria-hidden="true" />外观</h3>

        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row theme-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">主题颜色</span>
              <span class="cl-setting__desc">选择预设主题或自定义配色</span>
            </div>
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
          <div v-show="settings.settings.theme === 'custom'" class="custom-panel">
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

        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row theme-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">字体样式</span>
              <span class="cl-setting__desc">选择界面使用的字体</span>
            </div>
          </div>
          <div class="font-preview" :style="{ fontFamily: settings.settings.fontFamily }">
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

        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">背景透明度</span>
              <span class="cl-setting__desc">弹窗和菜单不受影响</span>
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

        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row select-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">系统毛玻璃（实验）</span>
              <span class="cl-setting__desc">{{ glassDesc }}</span>
            </div>
            <select
              class="cl-select glass-select"
              aria-label="系统毛玻璃"
              :value="settings.settings.nativeGlass"
              @change="setNativeGlass($event)"
            >
              <option v-for="o in glassOptions" :key="o.value" :value="o.value">{{ o.label }}</option>
            </select>
          </div>
        </div>
      </section>

      <!-- 列表显示 -->
      <section class="settings-section">
        <h3 class="cl-section-head settings-section-title"><ListFilter :size="13" aria-hidden="true" />列表显示</h3>
        <div class="cl-panel settings-card">
          <div class="cl-setting settings-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">显示大盘指数</span>
              <span class="cl-setting__desc">显示上证、深证、创业板指数</span>
            </div>
            <label class="cl-switch">
              <input type="checkbox" aria-label="显示大盘指数" :checked="settings.settings.showIndices" @change="toggleShowIndices">
              <span class="cl-switch__track"></span>
            </label>
          </div>
          <div class="cl-setting settings-row">
            <div class="cl-setting__info">
              <span class="cl-setting__label">显示分时折线图</span>
              <span class="cl-setting__desc">关闭后窗口可缩窄至 200</span>
            </div>
            <label class="cl-switch">
              <input type="checkbox" aria-label="显示分时折线图" :checked="settings.settings.showSparklines" @change="toggleShowSparklines">
              <span class="cl-switch__track"></span>
            </label>
          </div>
        </div>
      </section>
    </div>

    <footer class="cl-dialog__foot settings-footer">
      <button class="cl-btn cl-btn--block cl-btn--lg reset-btn" type="button" :disabled="pendingKeys.reset" @click="handleReset">恢复默认</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, type Component } from 'vue'
import {
  AppWindow,
  CornerDownLeft,
  CornerDownRight,
  CornerUpLeft,
  CornerUpRight,
  Keyboard,
  ListFilter,
  Moon,
  Move,
  Palette,
  Sun,
  X
} from 'lucide-vue-next'
import { invoke } from '@tauri-apps/api/core'
import { PhysicalPosition } from '@tauri-apps/api/dpi'
import { currentMonitor, getCurrentWindow } from '@tauri-apps/api/window'
import { useSettingsStore, FONT_OPTIONS } from '../stores/settings'
import { NATIVE_GLASS_OPTIONS, type NativeGlassMode } from '../coolove-ui/nativeGlass'
import {
  resetSettingsWithEffects,
  toggleAlwaysOnTopWithEffect,
  toggleAutoStartWithEffect
} from '../utils/settingsActions'
import { cornerPosition, type WindowCorner } from '../utils/windowGeometry'
import { isTauriRuntime } from '../utils/persistence'
import ShortcutRecorder from '../components/settings/ShortcutRecorder.vue'

const emit = defineEmits<{
  close: []
}>()

const settings = useSettingsStore()

const fonts = FONT_OPTIONS
const opacityPercent = computed(() => Math.round(settings.settings.backgroundOpacity * 100))
const glassOptions = NATIVE_GLASS_OPTIONS
const glassDesc = computed(() => {
  const mode = settings.settings.nativeGlass
  if (mode === 'off') return '由系统模糊窗口后面的桌面；打开后用背景透明度调节色调深浅'
  if (!settings.glassActive) return '当前系统不支持所选效果，已保持普通外观'
  return NATIVE_GLASS_OPTIONS.find((o) => o.value === mode)?.hint ?? ''
})

function setNativeGlass(event: Event) {
  settings.updateSettings('nativeGlass', (event.target as HTMLSelectElement).value as NativeGlassMode)
}
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

/* ---------------- 贴边位置 ---------------- */

const corners: { value: WindowCorner; label: string; icon: Component }[] = [
  { value: 'top-left', label: '左上', icon: CornerUpLeft },
  { value: 'top-right', label: '右上', icon: CornerUpRight },
  { value: 'bottom-left', label: '左下', icon: CornerDownLeft },
  { value: 'bottom-right', label: '右下', icon: CornerDownRight }
]

const activeCorner = ref<WindowCorner | null>(null)
const cornerError = ref('')

async function snapToCorner(corner: WindowCorner) {
  cornerError.value = ''
  if (!isTauriRuntime()) {
    cornerError.value = '贴边操作仅在桌面客户端可用'
    return
  }

  try {
    const monitor = await currentMonitor()
    if (!monitor) throw new Error('未找到当前显示器')

    const window = getCurrentWindow()
    const size = await window.outerSize()
    const area = monitor.workArea
    const target = cornerPosition(
      corner,
      { x: area.position.x, y: area.position.y, width: area.size.width, height: area.size.height },
      { width: size.width, height: size.height }
    )

    await window.setPosition(new PhysicalPosition(target.x, target.y))
    activeCorner.value = corner
  } catch (error) {
    cornerError.value = error instanceof Error ? error.message : String(error)
  }
}

/* ---------------- 全局快捷键 ---------------- */

// 注册失败（被系统/其他程序占用）与组合冲突分开记录，互不覆盖
const shortcutRegisterError = ref('')
const shortcutConflictError = ref('')
const shortcutError = computed(() => shortcutRegisterError.value || shortcutConflictError.value)
let shortcutCaptureActive = false

async function applyGlobalShortcuts() {
  if (!isTauriRuntime()) return
  try {
    await invoke('set_global_shortcuts', {
      show: settings.settings.showShortcut,
      hide: settings.settings.hideShortcut
    })
    shortcutRegisterError.value = ''
  } catch (error) {
    shortcutRegisterError.value = error instanceof Error ? error.message : String(error)
  }
}

function handleShortcutRecording(recording: boolean) {
  shortcutCaptureActive = recording
  // 录制时先停用已有全局热键，否则按下旧组合会直接隐藏/唤出窗口
  if (recording) {
    if (isTauriRuntime()) {
      void invoke('set_global_shortcuts', { show: '', hide: '' }).catch(() => {
        /* 停用失败不阻塞录制，提交时会重新注册 */
      })
    }
    return
  }

  void applyGlobalShortcuts()
}

function updateShortcut(key: 'showShortcut' | 'hideShortcut', value: string) {
  const otherKey = key === 'showShortcut' ? 'hideShortcut' : 'showShortcut'
  if (value && value === settings.settings[otherKey]) {
    shortcutConflictError.value = '打开窗口和隐藏窗口不能使用同一个快捷键'
    return
  }

  shortcutConflictError.value = ''
  settings.updateSettings(key, value)
}

function handleClose() {
  if (shortcutCaptureActive) {
    shortcutCaptureActive = false
    void applyGlobalShortcuts()
  }
  emit('close')
}

onUnmounted(() => {
  if (shortcutCaptureActive) {
    void applyGlobalShortcuts()
  }
})

async function handleReset() {
  if (pendingKeys.value.reset) return

  setPending('reset', true)
  try {
    shortcutConflictError.value = ''
    await resetSettingsWithEffects(settings, invoke)
    await applyGlobalShortcuts()
  } catch (e) {
    console.error('Reset settings error:', e)
  } finally {
    setPending('reset', false)
  }
}
</script>

<style scoped>
/* 控件外观来自 coolove-ui（cl-setting / cl-switch / cl-segmented / cl-range），这里只负责分组与间距 */
.settings-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.settings-header {
  padding: 14px 14px 10px 16px;
}

.settings-content {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 0 14px 12px;
}

.settings-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.settings-section-title {
  margin: 0;
  gap: 6px;
}

.settings-section-title svg {
  color: var(--accent-text);
  flex-shrink: 0;
}

.settings-card {
  padding: 2px 12px;
}

.settings-row {
  padding: 9px 0;
}

.settings-row + .settings-row {
  border-top: 1px solid var(--divider-color);
}

.settings-hint {
  margin: 0;
  font-size: var(--fs-xs);
  line-height: 1.5;
  color: var(--text-muted);
}

.settings-hint.is-error {
  color: var(--c-err-text);
}

/* 贴边位置：2×2 网格 */
.corner-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.corner-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--surface-1);
  color: var(--text-secondary);
  font: inherit;
  font-size: var(--fs-sm);
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
}

.corner-btn:hover {
  border-color: var(--accent);
  color: var(--text-primary);
}

.corner-btn.is-active {
  border-color: var(--accent);
  background: var(--surface-2);
  color: var(--accent-text);
}

/* 窄窗口下说明文字占满一行，控件另起一行铺满，避免文字被挤成竖排 */
.settings-card .cl-setting__info {
  flex: 1 1 5em;
}

/* 快捷键 */
.shortcut-row {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.shortcut-row :deep(.shortcut-recorder) {
  width: 100%;
}

/* 宽窗口（详情展开或大屏）里恢复左右排布，快捷键框不必铺满整行 */
@media (min-width: 480px) {
  .shortcut-row {
    flex-direction: row;
    align-items: center;
  }

  .shortcut-row :deep(.shortcut-recorder) {
    width: auto;
    min-width: 148px;
    flex-shrink: 0;
  }
}

/* 主题 */
.theme-row {
  padding-bottom: 4px;
}

.theme-buttons {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 2px;
  margin-bottom: 10px;
}

.theme-btn {
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  height: 48px;
  padding: 0 2px;
  font-size: var(--fs-xs);
}

.theme-btn span {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.custom-panel {
  border-top: 1px solid var(--divider-color);
  padding-top: 2px;
}

.color-row {
  padding: 8px 0;
}

.color-label {
  font-size: var(--fs-sm);
}

.color-hex {
  font-size: var(--fs-xs);
}

.color-picker {
  flex-shrink: 0;
}

/* 字体 */
.font-preview {
  margin-bottom: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  font-size: 16px;
  line-height: 1.4;
}

.font-select {
  margin-bottom: 10px;
}

.select-row {
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
}

.glass-select {
  margin-bottom: 10px;
}

.opacity-value {
  font-size: var(--fs-md);
}

.opacity-slider {
  width: 100%;
  margin-bottom: 10px;
}

.settings-footer {
  padding: 10px 14px 14px;
  border-top: 1px solid var(--divider-color);
}
</style>
