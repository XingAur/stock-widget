import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PERSIST_SCHEMA_VERSION,
  PERSIST_SHADOW_KEY,
  adoptPersistedSlices,
  buildPersistPayload,
  flushPersistedState,
  parsePersistedState,
  resetPersistenceForTests,
  updatePersistedSlice
} from './persistence'

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

  it('rejects corrupted payloads instead of throwing', () => {
    expect(parsePersistedState('not json')).toBeNull()
    expect(parsePersistedState('')).toBeNull()
    expect(parsePersistedState(null)).toBeNull()
    expect(parsePersistedState('[1,2,3]')).toBeNull()
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
