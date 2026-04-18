import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

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
}

export const FONT_OPTIONS = [
  { label: '系统默认', value: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' },
  { label: '微软雅黑', value: '"Microsoft YaHei", "PingFang SC", sans-serif' },
  { label: '思源黑体', value: '"Source Han Sans CN", "Noto Sans CJK SC", sans-serif' },
  { label: '等线', value: 'DengXian, "PingFang SC", sans-serif' },
  { label: '宋体', value: 'SimSun, "STSong", serif' },
  { label: '等宽字体', value: '"Cascadia Code", "JetBrains Mono", "SF Mono", Consolas, monospace' }
]

const DEFAULT_SETTINGS: Settings = {
  alwaysOnTop: false,
  autoStart: false,
  minimizeToTray: true,
  backgroundOpacity: 0.85,
  theme: 'dark',
  customBgColor: '#1f2937',
  customFontColor: '#ffffff',
  fontFamily: FONT_OPTIONS[0].value,
  showIndices: true,
  showSparklines: true
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })
  const hasLoaded = ref(false)

  watch(settings, () => {
    if (!hasLoaded.value) {
      return
    }

    persist()
    applySettings()
  }, { deep: true })

  function load() {
    const saved = localStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      } catch (error) {
        console.error('Load settings error:', error)
        settings.value = { ...DEFAULT_SETTINGS }
      }
    }

    hasLoaded.value = true
    persist()
    applySettings()
  }

  function persist() {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings.value))
  }

  function applySettings() {
    document.documentElement.setAttribute('data-theme', settings.value.theme)
    document.documentElement.style.setProperty('--bg-opacity', String(settings.value.backgroundOpacity))

    if (settings.value.theme === 'custom') {
      applyCustomTheme()
    } else {
      clearCustomTheme()
      const opacity = settings.value.backgroundOpacity
      const solidBg = settings.value.theme === 'light'
        ? `rgba(243, 244, 246, ${opacity})`
        : `rgba(31, 41, 55, ${opacity})`
      document.documentElement.style.setProperty('--solid-bg', solidBg)
    }

    document.documentElement.style.setProperty('--font-family', settings.value.fontFamily)
  }

  function applyCustomTheme() {
    const hex = settings.value.customBgColor.replace('#', '')
    const r = parseInt(hex.slice(0, 2), 16)
    const g = parseInt(hex.slice(2, 4), 16)
    const b = parseInt(hex.slice(4, 6), 16)
    const opacity = settings.value.backgroundOpacity

    document.documentElement.style.setProperty('--window-bg', `rgba(${r}, ${g}, ${b}, ${opacity})`)
    document.documentElement.style.setProperty('--card-bg', `rgba(${r}, ${g}, ${b}, ${Math.min(1, opacity + 0.15)})`)
    document.documentElement.style.setProperty('--card-bg-hover', `rgba(${r}, ${g}, ${b}, ${Math.min(1, opacity + 0.3)})`)
    document.documentElement.style.setProperty('--text-primary', settings.value.customFontColor)
    document.documentElement.style.setProperty('--text-secondary', `${settings.value.customFontColor}b3`)
    document.documentElement.style.setProperty('--text-muted', `${settings.value.customFontColor}80`)
    document.documentElement.style.setProperty('--border-color', `${settings.value.customFontColor}1a`)
    document.documentElement.style.setProperty('--divider-color', `${settings.value.customFontColor}1a`)
    document.documentElement.style.setProperty('--input-bg', `${settings.value.customFontColor}0d`)
    document.documentElement.style.setProperty('--solid-bg', `rgba(${r}, ${g}, ${b}, ${opacity})`)
  }

  function clearCustomTheme() {
    document.documentElement.style.removeProperty('--window-bg')
    document.documentElement.style.removeProperty('--card-bg')
    document.documentElement.style.removeProperty('--card-bg-hover')
    document.documentElement.style.removeProperty('--text-primary')
    document.documentElement.style.removeProperty('--text-secondary')
    document.documentElement.style.removeProperty('--text-muted')
    document.documentElement.style.removeProperty('--border-color')
    document.documentElement.style.removeProperty('--divider-color')
    document.documentElement.style.removeProperty('--input-bg')
  }

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
    load,
    save: persist,
    updateSettings,
    reset
  }
})
