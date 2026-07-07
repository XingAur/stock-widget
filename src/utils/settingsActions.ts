import type { Settings } from '../stores/settings'

export type SettingsInvoke = (command: string, args?: Record<string, unknown>) => Promise<unknown>

export interface SettingsActionStore {
  settings: Settings
  updateSettings<K extends keyof Settings>(key: K, value: Settings[K]): void
  reset(): void
}

export async function toggleAlwaysOnTopWithEffect(
  store: SettingsActionStore,
  invoke: SettingsInvoke
): Promise<void> {
  const previousValue = store.settings.alwaysOnTop
  const nextValue = !previousValue

  store.updateSettings('alwaysOnTop', nextValue)

  try {
    await invoke('set_always_on_top', { enabled: nextValue })
  } catch (error) {
    store.updateSettings('alwaysOnTop', previousValue)
    throw error
  }
}

export async function toggleAutoStartWithEffect(
  store: SettingsActionStore,
  invoke: SettingsInvoke
): Promise<void> {
  const previousValue = store.settings.autoStart
  const nextValue = !previousValue

  store.updateSettings('autoStart', nextValue)

  try {
    await invoke('set_auto_start', { enabled: nextValue })
  } catch (error) {
    store.updateSettings('autoStart', previousValue)
    throw error
  }
}

export async function resetSettingsWithEffects(
  store: SettingsActionStore,
  invoke: SettingsInvoke
): Promise<void> {
  if (store.settings.alwaysOnTop) {
    await invoke('set_always_on_top', { enabled: false })
  }

  if (store.settings.autoStart) {
    await invoke('set_auto_start', { enabled: false })
  }

  store.reset()
}
