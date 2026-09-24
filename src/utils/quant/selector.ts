/** Top-N 选择器（与 a-share-quant portfolio/selector.py 对齐的轻量版） */

import type { FactorRow } from './types'

export type TopNOption = 3 | 5 | 10 | 'all'

export const TOP_N_OPTIONS: { value: TopNOption; label: string }[] = [
  { value: 3, label: 'Top 3' },
  { value: 5, label: 'Top 5' },
  { value: 10, label: 'Top 10' },
  { value: 'all', label: '全部' }
]

export interface SelectionResult {
  /** 选中的 code 集合（按评分降序） */
  selected: string[]
  /** 目标权重 map（等权或评分加权） */
  weights: Map<string, number>
  /** 入选但未录入持仓的数量（提示可建仓） */
  newPositions: number
}

export function selectTopN(
  rows: FactorRow[],
  topN: TopNOption,
  mode: 'equal' | 'score'
): SelectionResult {
  const scored = rows
    .filter((row) => row.composite !== null)
    .sort((left, right) => (right.composite as number) - (left.composite as number))

  const selected = topN === 'all' ? scored.map((row) => row.code) : scored.slice(0, topN).map((row) => row.code)

  const weights = new Map<string, number>()
  if (selected.length === 0) {
    return { selected, weights, newPositions: 0 }
  }

  if (mode === 'equal') {
    const weight = 1 / selected.length
    selected.forEach((code) => weights.set(code, weight))
    return { selected, weights, newPositions: selected.length }
  }

  // 评分加权：0.5+u（截断保底 0.05，与 Python 端一致）
  const subset = scored.filter((row) => selected.includes(row.code))
  const raw = subset.map((row) => Math.max(0.5 + (row.composite as number), 0.05))
  const total = raw.reduce((sum, value) => sum + value, 0)
  subset.forEach((row, index) => weights.set(row.code, raw[index] / total))
  return { selected, weights, newPositions: selected.length }
}
