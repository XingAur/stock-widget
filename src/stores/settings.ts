import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export type ThemeMode = 'dark' | 'light'

export interface Settings {
  alwaysOnTop: boolean
  autoStart: boolean
  minimizeToTray: boolean
  backgroundOpacity: number
  theme: ThemeMode
  showIndices: boolean
  showSparklines: boolean
}

const DEFAULT_SETTINGS: Settings = {
  alwaysOnTop: false,
  autoStart: false,
  minimizeToTray: true,
  backgroundOpacity: 0.85,
  theme: 'dark',
  showIndices: true,
  showSparklines: true
}

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<Settings>({ ...DEFAULT_SETTINGS })

  // 从本地存储加载
  function load() {
    const saved = localStorage.getItem('settings')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        settings.value = { ...DEFAULT_SETTINGS, ...parsed }
      } catch (e) {
        console.error('Load settings error:', e)
      }
    }
    applySettings()
  }

  // 保存到本地存储
  function save() {
    localStorage.setItem('settings', JSON.stringify(settings.value))
  }

  // 应用设置
  function applySettings() {
    // 应用主题
    document.documentElement.setAttribute('data-theme', settings.value.theme)

    // 应用背景透明度
    document.documentElement.style.setProperty(
      '--bg-opacity',
      String(settings.value.backgroundOpacity)
    )
  }

  // 更新设置
  function updateSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
    settings.value[key] = value
    save()
    applySettings()
  }

  // 重置设置
  function reset() {
    settings.value = { ...DEFAULT_SETTINGS }
    save()
    applySettings()
  }

  // 监听变化自动保存
  watch(settings, () => {
    save()
    applySettings()
  }, { deep: true })

  return {
    settings,
    load,
    save,
    updateSettings,
    reset
  }
})