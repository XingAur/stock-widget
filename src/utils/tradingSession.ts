/** A-share session clock in Asia/Shanghai, independent of the OS timezone. */

export type AStockSession = 'preopen' | 'morning' | 'lunch' | 'afternoon' | 'closed' | 'weekend'

export interface ShanghaiClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  weekday: number
  ymd: string
}

const SHANGHAI = 'Asia/Shanghai'

export function getShanghaiClock(now: Date = new Date()): ShanghaiClock {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHANGHAI,
    hour12: false,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(now)

  const read = (type: string) => parts.find((part) => part.type === type)?.value ?? ''
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  const hourRaw = Number(read('hour'))
  return {
    year: Number(read('year')),
    month: Number(read('month')),
    day: Number(read('day')),
    hour: hourRaw === 24 ? 0 : hourRaw,
    minute: Number(read('minute')),
    weekday: weekdayMap[read('weekday')] ?? 1,
    ymd: read('year') + '-' + read('month') + '-' + read('day')
  }
}


export function getAStockSessionState(now: Date = new Date()): AStockSession {
  const clock = getShanghaiClock(now)
  if (clock.weekday === 0 || clock.weekday === 6) {
    return 'weekend'
  }
  const minutes = clock.hour * 60 + clock.minute
  if (minutes < 9 * 60 + 15) {
    return 'preopen'
  }
  if (minutes < 11 * 60 + 30) {
    return 'morning'
  }
  if (minutes < 13 * 60) {
    return 'lunch'
  }
  if (minutes < 15 * 60) {
    return 'afternoon'
  }
  return 'closed'
}

export function shouldRefreshSparkline(now: Date = new Date()): boolean {
  const session = getAStockSessionState(now)
  return session === 'morning' || session === 'lunch' || session === 'afternoon'
}

export function quoteIntervalMs(now: Date = new Date()): number {
  const session = getAStockSessionState(now)
  if (session === 'morning' || session === 'afternoon') {
    return 30_000
  }
  if (session === 'lunch') {
    return 120_000
  }
  return 600_000
}

export function sparklineIntervalMs(now: Date = new Date()): number {
  if (!shouldRefreshSparkline(now)) {
    return 0
  }
  return getAStockSessionState(now) === 'lunch' ? 180_000 : 90_000
}
