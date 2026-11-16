// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERSIST_SCHEMA_VERSION,
  PERSIST_SHADOW_KEY,
  adoptPersistedSlices,
  buildPersistPayload,
  flushPersistedState,
  parsePersistedState,
  readPersistedState,
  resetPersistenceForTests,
  updatePersistedSlice
} from './persistence'

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(async () => null)
}))

function createLocalStorage(): Storage {
  const values = new Map<string, string>()

  return {
    get length() {
      return values.size
    },
    clear() {
      values.clear()
    },
    getItem(key: string) {
      return values.get(key) ?? null
    },
    key(index: number) {
      return [...values.keys()][index] ?? null
    },
    removeItem(key: string) {
      values.delete(key)
    },
    setItem(key: string, value: string) {
      values.set(key, value)
    }
  }
}

describe('persistence payload', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', {
      value: createLocalStorage(),
      configurable: true
    })
    resetPersistenceForTests()
  })

  it('rejects payloads with the wrong schema version', () => {
    expect(parsePersistedState(JSON.stringify({ schemaVersion: 99 }))).toBeNull()
  })

  it('migrates v1 snapshots to v2 with a revision', () => {
    const payload = parsePersistedState(JSON.stringify({ schemaVersion: 1, watchList: ['600000'] }))
    expect(payload?.schemaVersion).toBe(2)
    expect(payload?.watchList).toEqual(['600000'])
    expect(payload?.revision).toBe(0)
  })

  it('rejects corrupted payloads instead of throwing', () => {
    expect(parsePersistedState('not json')).toBeNull()
    expect(parsePersistedState('')).toBeNull()
    expect(parsePersistedState(null)).toBeNull()
    expect(parsePersistedState('[1,2,3]')).toBeNull()
  })

  it('drops retired research slices without losing holdings or settings', () => {
    const payload = parsePersistedState(JSON.stringify({
      schemaVersion: 2,
      retiredResearchTopN: 5,
      importedResearchReport: { nav: [1, 1.1] },
      watchList: ['600000'],
      stockPositions: { '600000': { costPrice: 10, shares: 100 } },
      settings: { theme: 'dark' }
    }))!
    adoptPersistedSlices(payload)
    const saved = buildPersistPayload()
    expect(saved).not.toHaveProperty('retiredResearchTopN')
    expect(saved).not.toHaveProperty('importedResearchReport')
    expect(saved.watchList).toEqual(['600000'])
    expect(saved.stockPositions).toEqual({ '600000': { costPrice: 10, shares: 100 } })
    expect(saved.settings).toEqual({ theme: 'dark' })
  })

  it('prefers the shadow copy when it has a newer revision than the file', async () => {
    const core = await import('@tauri-apps/api/core')
    vi.mocked(core.invoke).mockResolvedValue(JSON.stringify({
      schemaVersion: PERSIST_SCHEMA_VERSION,
      revision: 3,
      watchList: ['600000']
    }))
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    localStorage.setItem(PERSIST_SHADOW_KEY, JSON.stringify({
      schemaVersion: PERSIST_SCHEMA_VERSION,
      revision: 4,
      watchList: ['600001']
    }))

    try {
      const state = await readPersistedState()
      expect(state?.revision).toBe(4)
      expect(state?.watchList).toEqual(['600001'])
    } finally {
      delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    }
  })

  it('keeps a migrated v1 file even when a stale shadow exists', async () => {
    const core = await import('@tauri-apps/api/core')
    vi.mocked(core.invoke).mockResolvedValue(JSON.stringify({
      schemaVersion: 1,
      watchList: ['600000']
    }))
    Object.defineProperty(globalThis, '__TAURI_INTERNALS__', { configurable: true, value: {} })
    localStorage.setItem(PERSIST_SHADOW_KEY, JSON.stringify({
      schemaVersion: PERSIST_SCHEMA_VERSION,
      revision: 3,
      watchList: ['600001']
    }))

    try {
      const state = await readPersistedState()
      expect(state?.watchList).toEqual(['600000'])
    } finally {
      delete (globalThis as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__
    }
  })

  it('accepts a well-formed payload', () => {
    const payload = parsePersistedState(
      JSON.stringify({ schemaVersion: PERSIST_SCHEMA_VERSION, watchList: ['600000'] })
    )
    expect(payload?.watchList).toEqual(['600000'])
  })

  it('merges registered slices into one debounced snapshot', async () => {
    updatePersistedSlice('watchList', ['600000'])
    updatePersistedSlice('stockPositions', { '600000': { costPrice: 10, shares: 100 } })
    await flushPersistedState()

    const snapshot = JSON.parse(localStorage.getItem(PERSIST_SHADOW_KEY) ?? '{}')
    expect(snapshot.schemaVersion).toBe(PERSIST_SCHEMA_VERSION)
    expect(snapshot.watchList).toEqual(['600000'])
    expect(snapshot.stockPositions).toEqual({ '600000': { costPrice: 10, shares: 100 } })
  })

  it('lets the latest slice value win when the same key is updated twice', async () => {
    updatePersistedSlice('watchList', ['600000'])
    updatePersistedSlice('watchList', ['000001'])
    await flushPersistedState()

    expect(buildPersistPayload().watchList).toEqual(['000001'])
  })

  it('adopts restored slices so subsequent saves keep untouched keys', async () => {
    adoptPersistedSlices({
      schemaVersion: PERSIST_SCHEMA_VERSION,
      watchList: ['600000'],
      fundWatchList: ['001186'],
      settings: { theme: 'light' }
    })
    updatePersistedSlice('watchList', [])
    await flushPersistedState()

    const snapshot = JSON.parse(localStorage.getItem(PERSIST_SHADOW_KEY) ?? '{}')
    expect(snapshot.watchList).toEqual([])
    expect(snapshot.fundWatchList).toEqual(['001186'])
    expect(snapshot.settings).toEqual({ theme: 'light' })
  })

  it('debounces rapid updates into a single flush', async () => {
    vi.useFakeTimers()
    try {
      for (let index = 0; index < 50; index += 1) {
        updatePersistedSlice('watchList', [`stock-${index}`])
      }
      expect(localStorage.getItem(PERSIST_SHADOW_KEY)).toBeNull()

      await vi.advanceTimersByTimeAsync(400)
      const snapshot = JSON.parse(localStorage.getItem(PERSIST_SHADOW_KEY) ?? '{}')
      expect(snapshot.watchList).toEqual(['stock-49'])
    } finally {
      vi.useRealTimers()
    }
  })
})
