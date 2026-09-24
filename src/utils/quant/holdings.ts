/** 自选池目标与用户已录持仓的对照；不推断现金或完整账户资产。 */

import type { StockPosition } from '../positions'
import type { FactorRow } from './types'
import { selectTopN, type TopNOption } from './selector'

export interface HoldingComparisonRow {
  code: string
  name: string
  targetPercent: number
  currentPercent: number | null
  drift: number | null
  driftAmount: number | null
  held: boolean
}

export interface HoldingComparison {
  rows: HoldingComparisonRow[]
  heldCount: number
  heldValue: number | null
  missingHeldQuotes: number
}

export function compareRecordedHoldings(
  rows: (FactorRow & { name: string })[],
  positions: Record<string, StockPosition>,
  prices: Record<string, number | undefined>,
  topN: TopNOption,
  mode: 'equal' | 'score',
  nameOf: (code: string) => string
): HoldingComparison {
  const targets = selectTopN(rows, topN, mode).weights
  const heldCodes = Object.keys(positions).filter((code) =>
    Number.isFinite(positions[code]?.shares) && positions[code].shares > 0
  )
  const hasPrice = (code: string) => Number.isFinite(prices[code]) && (prices[code] ?? 0) > 0
  const missingHeldQuotes = heldCodes.filter((code) => !hasPrice(code)).length
  const heldValue = missingHeldQuotes === 0
    ? heldCodes.reduce((sum, code) => sum + positions[code].shares * (prices[code] as number), 0)
    : null
  const codes = new Set([...targets.keys(), ...heldCodes])
  const comparisonRows: HoldingComparisonRow[] = [...codes].map((code) => {
    const shares = positions[code]?.shares ?? 0
    const held = shares > 0
    const currentPercent = heldValue !== null && heldValue > 0 && (!held || hasPrice(code))
      ? (held ? shares * (prices[code] as number) / heldValue : 0) * 100
      : null
    const targetPercent = (targets.get(code) ?? 0) * 100
    const drift = currentPercent === null ? null : (currentPercent - targetPercent) / 100
    return {
      code,
      name: nameOf(code),
      targetPercent,
      currentPercent,
      drift,
      driftAmount: drift === null || heldValue === null ? null : drift * heldValue,
      held
    }
  })
  comparisonRows.sort((left, right) =>
    (right.drift === null ? -1 : Math.abs(right.drift))
    - (left.drift === null ? -1 : Math.abs(left.drift))
  )
  return { rows: comparisonRows, heldCount: heldCodes.length, heldValue, missingHeldQuotes }
}
