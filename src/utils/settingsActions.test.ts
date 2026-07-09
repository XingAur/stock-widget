import { describe, expect, it, vi } from 'vitest'
import {
  resetSettingsWithEffects,
  toggleAutoStartWithEffect,
  toggleAlwaysOnTopWithEffect,
  type SettingsActionStore
} from './settingsActions'
import type { Settings } from '../stores/settings'

function createStore(overrides: Partial<Settings> = {}) {
  const settings: Settings = {
    alwaysOnTop: false,
    autoStart: false,
    minimizeToTray: true,
    backgroundOpacity: 0.85,
    theme: 'dark',
    customBgColor: '#1f2937',
    customFontColor: '#ffffff',
    fontFamily: 'system',
    showIndices: true,
    showSparklines: true,
    ...overrides
  }

  const store: SettingsActionStore = {
    settings,
    updateSettings<K extends keyof Settings>(key: K, value: Settings[K]) {
      settings[key] = value
    },
    reset: vi.fn(() => {
      settings.alwaysOnTop = false
      settings.autoStart = false
    })
  }

  return store
}

describe('settings actions', () => {
  it('keeps always-on-top enabled when the command succeeds', async () => {
    const store = createStore({ alwaysOnTop: false })
    const invoke = vi.fn().mockResolvedValue(undefined)

    await toggleAlwaysOnTopWithEffect(store, invoke)

    expect(invoke).toHaveBeenCalledWith('set_always_on_top', { enabled: true })
    expect(store.settings.alwaysOnTop).toBe(true)
  })

  it('rolls always-on-top back when the command fails', async () => {
    const store = createStore({ alwaysOnTop: false })
    const invoke = vi.fn().mockRejectedValue(new Error('window failed'))

    await expect(toggleAlwaysOnTopWithEffect(store, invoke)).rejects.toThrow('window failed')

    expect(store.settings.alwaysOnTop).toBe(false)
  })

  it('rolls auto-start back when the command fails', async () => {
    const store = createStore({ autoStart: true })
    const invoke = vi.fn().mockRejectedValue(new Error('autostart failed'))

    await expect(toggleAutoStartWithEffect(store, invoke)).rejects.toThrow('autostart failed')

    expect(store.settings.autoStart).toBe(true)
  })

  it('resets only after system side effects succeed', async () => {
    const store = createStore({ alwaysOnTop: true, autoStart: true })
    const invoke = vi.fn().mockResolvedValue(undefined)

    await resetSettingsWithEffects(store, invoke)

    expect(invoke).toHaveBeenCalledWith('set_always_on_top', { enabled: false })
    expect(invoke).toHaveBeenCalledWith('set_auto_start', { enabled: false })
    expect(store.reset).toHaveBeenCalledTimes(1)
  })

  it('does not reset when disabling a system side effect fails', async () => {
    const store = createStore({ alwaysOnTop: true, autoStart: false })
    const invoke = vi.fn().mockRejectedValue(new Error('window failed'))

    await expect(resetSettingsWithEffects(store, invoke)).rejects.toThrow('window failed')

    expect(store.reset).not.toHaveBeenCalled()
    expect(store.settings.alwaysOnTop).toBe(true)
  })
})
