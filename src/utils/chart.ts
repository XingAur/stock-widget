export interface KlineLikePoint {
  time: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export type AggregatePeriod = 'week' | 'month' | 'quarter' | 'year'

export function parseChartDate(value: string): Date | null {
  const normalized = value.includes('T') ? value : `${value}T00:00:00`
  const parsed = new Date(normalized)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getWeekBucket(date: Date): string {
  const normalized = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const weekday = normalized.getUTCDay() || 7
  normalized.setUTCDate(normalized.getUTCDate() + 4 - weekday)
  const yearStart = new Date(Date.UTC(normalized.getUTCFullYear(), 0, 1))
  const week = Math.ceil((((normalized.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${normalized.getUTCFullYear()}-W${week.toString().padStart(2, '0')}`
}

export function getPeriodBucket(time: string, mode: AggregatePeriod): string {
  const date = parseChartDate(time)
  if (!date) return time

  const year = date.getFullYear()
  const month = date.getMonth() + 1

  switch (mode) {
    case 'week':
      return getWeekBucket(date)
    case 'month':
      return `${year}-${month.toString().padStart(2, '0')}`
    case 'quarter':
      return `${year}-Q${Math.floor((month - 1) / 3) + 1}`
    case 'year':
      return `${year}`
    default:
      return time
  }
}

export function aggregateKlines<T extends KlineLikePoint>(points: T[], mode: AggregatePeriod): KlineLikePoint[] {
  if (points.length === 0) return []

  const buckets = new Map<string, T[]>()

  points.forEach((point) => {
    const bucket = getPeriodBucket(point.time, mode)
    const group = buckets.get(bucket)
    if (group) {
      group.push(point)
    } else {
      buckets.set(bucket, [point])
    }
  })

  return Array.from(buckets.values()).map((group) => {
    const first = group[0]
    const last = group[group.length - 1]

    return {
      time: last.time,
      open: first.open,
      close: last.close,
      high: Math.max(...group.map((point) => point.high)),
      low: Math.min(...group.map((point) => point.low)),
      volume: group.reduce((sum, point) => sum + point.volume, 0)
    }
  })
}

export function createMovingAverage(values: number[], period: number): number[] {
  return values.map((_, index) => {
    if (index < period - 1) return Number.NaN
    let sum = 0
    for (let cursor = index - period + 1; cursor <= index; cursor += 1) {
      sum += values[cursor]
    }
    return sum / period
  })
}

export function getRange(values: number[]): [number, number] {
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1]
  if (min === max) {
    const offset = min === 0 ? 1 : Math.abs(min) * 0.02
    return [min - offset, max + offset]
  }
  const padding = (max - min) * 0.08
  return [min - padding, max + padding]
}

export function createSparklinePoints(prices: number[] | undefined, width = 120, height = 24): string {
  if (!prices || prices.length < 2) {
    return ''
  }

  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1

  return prices
    .map((price, index) => {
      const x = prices.length === 1 ? width / 2 : (index / (prices.length - 1)) * width
      const y = height - ((price - min) / range) * height
      return `${x.toFixed(2)},${y.toFixed(2)}`
    })
    .join(' ')
}
