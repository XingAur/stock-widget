/** 因子计算（阶段F-36，自 quant.ts 拆分；语义与 a-share-quant ranking.py 对齐） */

import type { KlinePoint } from '../../api/stock'
import type { FactorRow } from './types'

const MOM_WINDOW = 20
const REV_WINDOW = 5
const VOL_WINDOW = 20
export const MOM_WEIGHT = 0.7
export const REV_WEIGHT = 0.3

function lastN(closes: number[], n: number): number[] | null {
  if (closes.length < n + 1) {
    return null
  }
  return closes.slice(-(n + 1))
}

export function momentum20(closes: number[]): number | null {
  const window = lastN(closes, MOM_WINDOW)
  if (!window || window[0] <= 0) {
    return null
  }
  return window[window.length - 1] / window[0] - 1
}

/** 反转因子（与 a-share-quant classic.py 一致）：-(P[t]/P[t-5]-1)。
 * 近 5 日跌得越多分越高（超跌反弹假设）。旧实现漏了负号，方向相反。 */
export function reversal5(closes: number[]): number | null {
  const window = lastN(closes, REV_WINDOW)
  if (!window || window[0] <= 0) {
    return null
  }
  return -(window[window.length - 1] / window[0] - 1)
}

export function volatility20(closes: number[]): number | null {
  if (closes.length < VOL_WINDOW + 1) {
    return null
  }
  const window = closes.slice(-(VOL_WINDOW + 1))
  const returns: number[] = []
  for (let index = 1; index < window.length; index += 1) {
    if (window[index - 1] > 0) {
      returns.push(window[index] / window[index - 1] - 1)
    }
  }
  if (returns.length === 0) {
    return null
  }
  const mean = returns.reduce((total, value) => total + value, 0) / returns.length
  const variance = returns.reduce((total, value) => total + (value - mean) ** 2, 0) / returns.length
  return Math.sqrt(variance)
}

function zscore(values: (number | null)[]): (number | null)[] {
  const valid = values.filter((value): value is number => value !== null)
  if (valid.length < 2) {
    return values.map(() => null)
  }
  const mean = valid.reduce((total, value) => total + value, 0) / valid.length
  const variance = valid.reduce((total, value) => total + (value - mean) ** 2, 0) / valid.length
  const std = Math.sqrt(variance)
  if (std === 0) {
    return values.map(() => 0)
  }
  return values.map((value) => (value === null ? null : (value - mean) / std))
}

export function computeFactorRows(klines: Record<string, KlinePoint[]>): FactorRow[] {
  const codes = Object.keys(klines)
  const moms = codes.map((code) => momentum20(klines[code].map((point) => point.close)))
  const revs = codes.map((code) => reversal5(klines[code].map((point) => point.close)))
  const vols = codes.map((code) => volatility20(klines[code].map((point) => point.close)))
  const momZ = zscore(moms)
  const revZ = zscore(revs)

  const rows: FactorRow[] = codes.map((code, index) => {
    const composite = momZ[index] === null || revZ[index] === null
      ? null
      : MOM_WEIGHT * (momZ[index] as number) + REV_WEIGHT * (revZ[index] as number)
    const points = klines[code]
    return {
      code,
      mom20: moms[index],
      rev5: revs[index],
      vol20: vols[index],
      composite,
      rank: 0,
      lastClose: points.length > 0 ? points[points.length - 1].close : 0
    }
  })

  const ranked = [...rows]
    .filter((row) => row.composite !== null)
    .sort((left, right) => (right.composite as number) - (left.composite as number))
  ranked.forEach((row, index) => {
    row.rank = index + 1
  })
  return rows.sort((left, right) => {
    if (left.composite === null) {
      return 1
    }
    if (right.composite === null) {
      return -1
    }
    return right.composite - left.composite
  })
}

