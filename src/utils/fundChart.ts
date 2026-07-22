import type { FundNavPoint } from '../api/stock'
import type { FundDailySnapshot, FundNavPointLike } from './fundLedger'

export type FundChartRange = '1m' | '3m' | '6m' | '1y' | 'all'

export interface DatedValue {
  date: string
  value: number
}

export interface FundPerformanceSeries {
  fund: DatedValue[]
  benchmark: DatedValue[]
  minValue: number
  maxValue: number
}

const RANGE_DAYS: Record<Exclude<FundChartRange, 'all'>, number> = {
  '1m': 31,
  '3m': 93,
  '6m': 186,
  '1y': 366
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2))
}

function parseDate(date: string): number {
  const timestamp = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(timestamp) ? timestamp : 0
}

export function filterDatedValuesByRange(
  points: readonly DatedValue[],
  range: FundChartRange
): DatedValue[] {
  const sorted = [...points]
    .filter((point) => point.date && Number.isFinite(point.value))
    .sort((left, right) => left.date.localeCompare(right.date))
  if (range === 'all' || sorted.length === 0) {
    return sorted
  }

  const latest = parseDate(sorted[sorted.length - 1].date)
  const cutoff = latest - RANGE_DAYS[range] * 86_400_000
  return sorted.filter((point) => parseDate(point.date) >= cutoff)
}

export function filterFundNavPointsByRange(
  points: readonly FundNavPoint[],
  range: FundChartRange
): FundNavPoint[] {
  const allowedDates = new Set(filterDatedValuesByRange(
    points.map((point) => ({ date: point.date, value: point.nav })),
    range
  ).map((point) => point.date))

  return [...points]
    .filter((point) => allowedDates.has(point.date))
    .sort((left, right) => left.date.localeCompare(right.date))
}

export function calculateFundRangeReturn(
  points: readonly FundNavPointLike[],
  range: FundChartRange
): number | null {
  const filtered = filterDatedValuesByRange(
    points
      .filter((point) => point.date && Number.isFinite(point.nav) && point.nav > 0)
      .map((point) => ({ date: point.date, value: point.nav })),
    range
  )
  if (filtered.length < 2) return null

  const first = filtered[0].value
  const last = filtered[filtered.length - 1].value
  return roundPercent((last / first - 1) * 100)
}

export function createPerformanceSeries(
  fundRows: readonly FundNavPointLike[],
  benchmarkRows: readonly DatedValue[],
  range: FundChartRange
): FundPerformanceSeries | null {
  const fundByDate = new Map(
    fundRows
      .filter((point) => point.date && Number.isFinite(point.nav) && point.nav > 0)
      .map((point) => [point.date, point.nav])
  )
  const benchmarkByDate = new Map(
    benchmarkRows
      .filter((point) => point.date && Number.isFinite(point.value) && point.value > 0)
      .map((point) => [point.date, point.value])
  )
  const common = [...fundByDate.keys()]
    .filter((date) => benchmarkByDate.has(date))
    .sort()
    .map((date) => ({ date, value: fundByDate.get(date) as number }))
  const filtered = filterDatedValuesByRange(common, range)
  if (filtered.length < 2) {
    return null
  }

  const startFund = fundByDate.get(filtered[0].date) as number
  const startBenchmark = benchmarkByDate.get(filtered[0].date) as number
  const fund = filtered.map(({ date }) => ({
    date,
    value: roundPercent(((fundByDate.get(date) as number) / startFund - 1) * 100)
  }))
  const benchmark = filtered.map(({ date }) => ({
    date,
    value: roundPercent(((benchmarkByDate.get(date) as number) / startBenchmark - 1) * 100)
  }))
  const values = [...fund, ...benchmark].map((point) => point.value)

  return {
    fund,
    benchmark,
    minValue: Math.min(...values),
    maxValue: Math.max(...values)
  }
}

export function createIncomeSeries(
  snapshots: readonly FundDailySnapshot[],
  range: FundChartRange
): DatedValue[] {
  return filterDatedValuesByRange(
    snapshots.map((snapshot) => ({ date: snapshot.date, value: snapshot.totalProfit })),
    range
  )
}

export function createLinePath(
  points: readonly DatedValue[],
  width: number,
  height: number,
  padding: number,
  domainMin?: number,
  domainMax?: number
): string {
  if (points.length === 0 || width <= padding * 2 || height <= padding * 2) {
    return ''
  }

  const values = points.map((point) => point.value)
  let minValue = Number.isFinite(domainMin) ? domainMin as number : Math.min(...values)
  let maxValue = Number.isFinite(domainMax) ? domainMax as number : Math.max(...values)
  if (minValue === maxValue) {
    minValue -= 1
    maxValue += 1
  }

  const chartWidth = width - padding * 2
  const chartHeight = height - padding * 2
  return points.map((point, index) => {
    const x = points.length === 1
      ? width / 2
      : padding + index / (points.length - 1) * chartWidth
    const y = padding + (maxValue - point.value) / (maxValue - minValue) * chartHeight
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(2)} ${y.toFixed(2)}`
  }).join(' ')
}
