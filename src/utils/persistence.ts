import { invoke } from '@tauri-apps/api/core'

export const PERSIST_SCHEMA_VERSION = 2
export const PERSIST_SHADOW_KEY = 'appStateShadow'
const PERSIST_DEBOUNCE_MS = 300

export type PersistedStateKey =
  | 'watchList'
  | 'fundWatchList'
  | 'fundNames'
  | 'stockPositions'
  | 'fundPositions'
  | 'fundLedgers'
  | 'activeAssetType'
  | 'activeMarket'
  | 'quantTopN'
  | 'importedQuantReport'
  | 'settings'

export interface PersistedAppState {
  schemaVersion: number
  revision?: number
  watchList?: string[]
  fundWatchList?: string[]
  fundNames?: Record<string, string>
  stockPositions?: Record<string, unknown>
  fundPositions?: Record<string, unknown>
  fundLedgers?: Record<string, unknown>
  activeAssetType?: string
  activeMarket?: string
  quantTopN?: number | string
  importedQuantReport?: unknown
  settings?: unknown
}

export function isTauriRuntime(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

export function parsePersistedState(raw: string | null | undefined): PersistedAppState | null {
  if (!raw || !raw.trim()) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null
    }
    return migratePersistedState(parsed)
  } catch {
    return null
  }
}

export function migratePersistedState(parsed: unknown): PersistedAppState | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null
  }
  const record = parsed as Record<string, unknown>
  const version = Number(record.schemaVersion)
  if (version !== 1 && version !== 2) {
    return null
  }
  const revision = Number(record.revision)
  return {
    ...(record as unknown as PersistedAppState),
    schemaVersion: PERSIST_SCHEMA_VERSION,
    revision: Number.isFinite(revision) ? revision : 0
  }
}

let persistRevision = 0
let cachedRead: Promise<PersistedAppState | null> | null = null

function readShadowCopy(): string | null {
  try {
    return localStorage.getItem(PERSIST_SHADOW_KEY)
  } catch {
    return null
  }
}

export function readPersistedState(): Promise<PersistedAppState | null> {
  cachedRead ??= (async () => {
    if (isTauriRuntime()) {
      try {
        const raw = await invoke<string | null>('load_app_state')
        const fromFile = parsePersistedState(raw)
        if (fromFile) {
          return fromFile
        }
      } catch (error) {
        console.error('Load persisted app state error:', error)
      }
    }

    return parsePersistedState(readShadowCopy())
  })()

  return cachedRead
}

const slices = new Map<string, unknown>()
let saveTimer: ReturnType<typeof setTimeout> | null = null
let persistInFlight = false
let persistDirtyAfterFlight = false

export function buildPersistPayload(): PersistedAppState {
  const payload: Record<string, unknown> = {
    schemaVersion: PERSIST_SCHEMA_VERSION,
    revision: persistRevision
  }
  for (const [key, value] of slices) {
    payload[key] = value
  }
  return payload as unknown as PersistedAppState
}

export function updatePersistedSlice(key: PersistedStateKey | string, value: unknown): void {
  slices.set(key, value)
  schedulePersist()
}

export function adoptPersistedSlices(payload: PersistedAppState): void {
  persistRevision = Number(payload.revision) || 0
  for (const [key, value] of Object.entries(payload)) {
    if (key !== 'schemaVersion' && key !== 'revision') {
      slices.set(key, value)
    }
  }
}

/**
 * 读取当前会话内某分片的最新值（含启动恢复与本次会话的所有更新）。
 */
export function readPersistedSlice(key: string): unknown {
  return slices.get(key)
}

function schedulePersist(): void {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
  }
  saveTimer = setTimeout(() => {
    saveTimer = null
    void flushPersistedState()
  }, PERSIST_DEBOUNCE_MS)
}

export async function flushPersistedState(): Promise<void> {
  persistRevision += 1
  const raw = JSON.stringify(buildPersistPayload())
  try {
    localStorage.setItem(PERSIST_SHADOW_KEY, raw)
  } catch (error) {
    console.error('Persist state shadow copy error:', error)
  }

  if (!isTauriRuntime()) {
    return
  }
  if (persistInFlight) {
    persistDirtyAfterFlight = true
    return
  }

  persistInFlight = true
  try {
    await invoke('persist_app_state', { state: raw })
  } catch (error) {
    console.error('Persist app state error:', error)
  } finally {
    persistInFlight = false
    if (persistDirtyAfterFlight) {
      persistDirtyAfterFlight = false
      schedulePersist()
    }
  }
}

export function resetPersistenceForTests(): void {
  cachedRead = null
  persistRevision = 0
  slices.clear()
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  persistInFlight = false
  persistDirtyAfterFlight = false
}
