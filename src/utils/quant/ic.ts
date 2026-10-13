import type { KlinePoint } from '../../api/stock'
import { computeFactorRows } from './factors'

export interface IcSummary {
  icMean: number
  icir: number
  days: number
}

function sliceToDate(points: KlinePoint[], asOf: string): KlinePoint[] {
  return points.filter((point) => point.time.slice(0, 10) <= asOf)
}

function nextReturn(points: KlinePoint[], asOf: string): number | null {
  const ordered = [...points].sort((left, right) => left.time.localeCompare(right.time))
  const index = ordered.findIndex((point) => point.time.slice(0, 10) === asOf)
  if (index < 0 || index + 1 >= ordered.length) {
    return null
  }
  const today = ordered[index].close
  const next = ordered[index + 1].close
  if (today <= 0) {
    return null
  }
  return next / today - 1
}

function pearson(left: number[], right: number[]): number | null {
  if (left.length < 2 || left.length !== right.length) {
    return null
  }
  const n = left.length
  const meanL = left.reduce((sum, value) => sum + value, 0) / n
  const meanR = right.reduce((sum, value) => sum + value, 0) / n
  let cov = 0
  let varL = 0
  let varR = 0
  for (let index = 0; index < n; index += 1) {
    const dL = left[index] - meanL
    const dR = right[index] - meanR
    cov += dL * dR
    varL += dL * dL
    varR += dR * dR
  }
  const denom = Math.sqrt(varL * varR)
  return denom > 0 ? cov / denom : null
}

export function summarizeRankIc(klines: Record<string, KlinePoint[]>): IcSummary {
  const dates = [...new Set(Object.values(klines).flatMap((points) => points.map((point) => point.time.slice(0, 10))))].sort()
  const series: number[] = []
  for (const asOf of dates) {
    const history: Record<string, KlinePoint[]> = {}
    for (const [code, points] of Object.entries(klines)) {
      const sliced = sliceToDate(points, asOf)
      if (sliced.length) {
        history[code] = sliced
      }
    }
    const rows = computeFactorRows(history).filter((row) => row.composite !== null)
    const xs: number[] = []
    const ys: number[] = []
    for (const row of rows) {
      const fwd = nextReturn(klines[row.code] ?? [], asOf)
      if (fwd === null) {
        continue
      }
      xs.push(row.composite as number)
      ys.push(fwd)
    }
    const ic = pearson(xs, ys)
    if (ic !== null) {
      series.push(ic)
    }
  }
  if (!series.length) {
    return { icMean: 0, icir: 0, days: 0 }
  }
  const icMean = series.reduce((sum, value) => sum + value, 0) / series.length
  const variance = series.reduce((sum, value) => sum + (value - icMean) ** 2, 0) / series.length
  const std = Math.sqrt(variance)
  return { icMean, icir: std > 0 ? icMean / std : 0, days: series.length }
}
