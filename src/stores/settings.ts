import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { readPersistedState, updatePersistedSlice } from '../utils/persistence'
import { applyCooloveTheme } from '../coolove-ui/useCooloveTheme'
import { applyNativeGlass, type NativeGlassMode } from '../coolove-ui/nativeGlass'
import {
  DEFAULT_HIDE_SHORTCUT,
  DEFAULT_SHOW_SHORTCUT,
  isValidShortcut
} from '../utils/shortcut'

const SETTINGS_STORAGE_KEY = 'settings'

export type ThemeMode = 'dark' | 'light' | 'custom'

export interface Settings {
  alwaysOnTop: boolean
  autoStart: boolean
  minimizeToTray: boolean
  backgroundOpacity: number
  theme: ThemeMode
  customBgColor: string
  customFontColor: string
  fontFamily: string
  showIndices: boolean
  showSparklines: boolean
  /** 系统毛玻璃（Windows Acrylic / Mica / Blur）；off 为只用 CSS 半透明 */
  nativeGlass: NativeGlassMode
  /** 全局快捷键：打开 / 隐藏窗口；空字符串表示停用 */
  showShortcut: string
  hideShortcut: string
}

export const FONT_OPTIONS = [
  { label: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: '思源黑体', value: '"Source Han Sans CN", "Noto Sans CJK SC", sans-serif' },
  { label: '等线', value: 'DengXian, "PingFang SC", sans-serif' },
  { label: '宋体', value: 'SimSun, "STSong", serif' },
  { label: '等宽字体', value: '"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, monospace' }
]

export const DEFAULT_SETTINGS: Settings = {
  alwaysOnTop: false,
  autoStart: false,
  minimizeToTray: true,
  backgroundOpacity: 0.85,
  theme: 'dark',
  customBgColor: '#1f2937',
  customFontColor: '#ffffff',
  fontFamily: FONT_OPTIONS[0].value,
  showIndices: true,
  showSparklines: true,
  nativeGlass: 'off',
  showShortcut: DEFAULT_SHOW_SHORTCUT,
  hideShortcut: DEFAULT_HIDE_SHORTCUT
}

const THEME_MODES: ThemeMode[] = ['dark', 'light', 'custom']
const GLASS_MODES: NativeGlassMode[] = ['off', 'auto', 'acrylic', 'mica', 'blur']
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

function sanitizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === 'boolean' ? value : fallback
}

function sanitizeOpacity(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1
    ? value
    : DEFAULT_SETTINGS.backgroundOpacity
}

function sanitizeTheme(value: unknown) {
  return THEME_MODES.includes(value as ThemeMode) ? value as ThemeMode : DEFAULT_SETTINGS.theme
}

function sanitizeHexColor(value: unknown, fallback: string) {
  return typeof value === 'string' && HEX_COLOR_PATTERN.test(value) ? value : fallback
}

function sanitizeFontFamily(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0 ? value : DEFAULT_SETTINGS.fontFamily
}

// 空字符串代表"未设置"，其余必须是合法组合键；写错的旧数据回落到默认值。
function sanitizeShortcut(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback
  const trimmed = value.trim()
  if (trimmed === '') return ''
  return isValidShortcut(trimmed) ? trimmed : fallback
}

export function sanitizeSettings(value: unknown): Settings {
  const stored = isRecord(value) ? value : {}

  const showShortcut = sanitizeShortcut(stored.showShortcut, DEFAULT_SETTINGS.showShortcut)
  let hideShortcut = sanitizeShortcut(stored.hideShortcut, DEFAULT_SETTINGS.hideShortcut)
  // 同一个组合键不能同时负责打开和隐藏：隐藏项冲突时停用，避免注册失败
  if (hideShortcut && hideShortcut === showShortcut) {
    hideShortcut = DEFAULT_SETTINGS.hideShortcut === showShortcut ? '' : DEFAULT_SETTINGS.hideShortcut
  }

  return {
    alwaysOnTop: sanitizeBoolean(stored.alwaysOnTop, DEFAULT_SETTINGS.alwaysOnTop),
    autoStart: sanitizeBoolean(stored.autoStart, DEFAULT_SETTINGS.autoStart),
    minimizeToTray: sanitizeBoolean(stored.minimizeToTray, DEFAULT_SETTINGS.minimizeToTray),
    backgroundOpacity: sanitizeOpacity(stored.backgroundOpacity),
    theme: sanitizeTheme(stored.theme),
    customBgColor: sanitizeHexColor(stored.customBgColor, DEFAULT_SETTINGS.customBgColor),
    customFontColor: sanitizeHexColor(stored.customFontColor, DEFAULT_SETTINGS.customFontColor),
    fontFamily: sanitizeFontFamily(stored.fontFamily),
    showIndices: sanitizeBoolean(stored.showIndices, DEFAULT_SETTINGS.showIndices),
    showSparklines: sanitizeBoolean(stored.showSparklines, DEFAULT_SETTINGS.showSparklines),
    nativeGlass: GLASS_MODES.includes(stored.nativeGlass as NativeGlassMode)
      ? stored.nativeGlass as NativeGlassMode
      : DEFAULT_SETTINGS.nativeGlass,
    showShortcut,
    hideShortcut
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const hasLoaded = ref(false)
  /** 系统毛玻璃已经打开（设置了且系统支持） */
  const glassActive = ref(false)

  watch(settings, () => {
    if (!hasLoaded.value) {
      return
    }

    updatePersistedSlice('settings', { ...settings.value })
    applySettings()
  }, { deep: true })

  function readLegacySettings(): unknown {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (!saved) {
      return null
    }

    try {
      return JSON.parse(saved)
    } catch (error) {
      console.error('Load settings error:', error)
      return null
    }
  }

  async function load() {
    const persisted = await readPersistedState()
    const source = persisted?.settings ?? readLegacySettings()
    if (source) {
      settings.value = sanitizeSettings(source)
    }

    hasLoaded.value = true
    updatePersistedSlice('settings', { ...settings.value })
    applySettings()
    void syncNativeGlass()
  }

  function applySettings() {
    // 主题、透明度、自定义配色统一交给 coolove-ui：派生色（卡片、边框、次要文字、浮层底色）由 CSS 计算
    applyCooloveTheme({
      theme: settings.value.theme,
      opacity: settings.value.backgroundOpacity,
      customBg: settings.value.customBgColor,
      customFg: settings.value.customFontColor,
      fontFamily: settings.value.fontFamily,
      glass: glassActive.value ? 'native' : 'css'
    })
  }

  // 系统毛玻璃只在 Tauri 窗口里可用；从未打开过且设置为关闭时不必调用
  let glassRequest = 0
  async function syncNativeGlass() {
    const mode = settings.value.nativeGlass
    if (!('__TAURI_INTERNALS__' in window) || (mode === 'off' && !glassActive.value)) {
      return
    }
    const request = ++glassRequest
    const active = await applyNativeGlass(mode)
    if (request !== glassRequest) return
    glassActive.value = active
    applySettings()
  }
  watch(() => settings.value.nativeGlass, () => {
    if (hasLoaded.value) void syncNativeGlass()
  })

  function updateSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings.value = {
      ...settings.value,
      [key]: value
    }
  }

  function reset() {
    settings.value = { ...DEFAULT_SETTINGS }
  }

  return {
    settings,
    glassActive,
    load,
    save: () => updatePersistedSlice('settings', { ...settings.value }),
    updateSettings,
    reset
  }
})
