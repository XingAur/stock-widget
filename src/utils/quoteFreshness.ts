import { getAStockSessionState } from './tradingSession'

export const FRESHNESS_LIVE_MS = 60_000
export const FRESHNESS_DELAYED_MS = 180_000

export type FreshnessLevel = 'live' | 'delayed' | 'stale'

export interface QuoteFreshness {
  sourceTime: Date | null
  ageMs: number | null
  level: FreshnessLevel
  label: string
}

export function parseQuoteSourceTime(time: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(time.trim())
  if (!match) {
    return null
  }
  const iso = match[1] + '-' + match[2] + '-' + match[3] + 'T' + match[4] + ':' + match[5] + ':' + match[6] + '+08:00'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

export function quoteAgeMs(time: string, now: Date = new Date()): number | null {
  const source = parseQuoteSourceTime(time)
  if (!source) {
    return null
  }
  return Math.max(0, now.getTime() - source.getTime())
}

export function freshnessLevel(ageMs: number | null, now: Date = new Date()): FreshnessLevel {
  const session = getAStockSessionState(now)
  if (session === 'closed' || session === 'weekend' || session === 'preopen') {
    return 'live'
  }
  if (ageMs === null) {
    return 'stale'
  }
  if (ageMs <= FRESHNESS_LIVE_MS) {
    return 'live'
  }
  if (ageMs <= FRESHNESS_DELAYED_MS) {
    return 'delayed'
  }
  return 'stale'
}

export function freshnessLabel(level: FreshnessLevel, ageMs: number | null): string {
  if (level === 'delayed' && ageMs !== null) {
    return '延迟 ' + Math.max(1, Math.round(ageMs / 1000)) + 's'
  }
  if (level === 'stale') {
    return '数据陈旧'
  }
  return ''
}

export function quoteFreshness(time: string, now: Date = new Date()): QuoteFreshness {
  const sourceTime = parseQuoteSourceTime(time)
  const ageMs = sourceTime ? Math.max(0, now.getTime() - sourceTime.getTime()) : null
  const level = freshnessLevel(ageMs, now)
  return { sourceTime, ageMs, level, label: freshnessLabel(level, ageMs) }
}

export function worstQuoteFreshness(times: string[], now: Date = new Date()): QuoteFreshness {
  if (times.length === 0) {
    return { sourceTime: null, ageMs: null, level: 'stale', label: '数据陈旧' }
  }
  let worst: QuoteFreshness | null = null
  for (const time of times) {
    const current = quoteFreshness(time, now)
    if (!worst || (current.ageMs ?? Infinity) > (worst.ageMs ?? -1)) {
      worst = current
    }
  }
  return worst as QuoteFreshness
}
