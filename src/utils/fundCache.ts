export interface FundDetailCacheEntry<T> {
  value: T
  savedAt: number
  isFresh: boolean
}

type FundCacheStorage = Pick<Storage, 'getItem' | 'setItem'>

interface StoredFundDetailCache<T> {
  savedAt: number
  value: T
}

function key(scope: string, code: string): string {
  return `fundDetail:${scope}:${code}`
}

function localDateKey(timestamp: number): string {
  const date = new Date(timestamp)
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

function defaultStorage(): FundCacheStorage | null {
  return typeof localStorage === 'undefined' ? null : localStorage
}

export function readFundDetailCache<T>(
  scope: string,
  code: string,
  ttl: number,
  now = Date.now(),
  storage: FundCacheStorage | null = defaultStorage()
): FundDetailCacheEntry<T> | null {
  if (!storage) return null

  try {
    const raw = storage.getItem(key(scope, code))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredFundDetailCache<T>>
    if (!Number.isFinite(parsed.savedAt) || !('value' in parsed)) return null
    const savedAt = parsed.savedAt as number
    return {
      value: parsed.value as T,
      savedAt,
      isFresh: now >= savedAt
        && now - savedAt <= ttl
        && localDateKey(now) === localDateKey(savedAt)
    }
  } catch {
    return null
  }
}

export function writeFundDetailCache<T>(
  scope: string,
  code: string,
  value: T,
  savedAt = Date.now(),
  storage: FundCacheStorage | null = defaultStorage()
): void {
  if (!storage) return
  try {
    storage.setItem(key(scope, code), JSON.stringify({ savedAt, value }))
  } catch (error) {
    console.warn('Write fund detail cache failed:', error)
  }
}
