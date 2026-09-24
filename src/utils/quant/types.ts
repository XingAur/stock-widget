/** 量化模块公共类型（阶段F-36 拆分自 quant.ts） */

import type { KlinePoint } from '../../api/stock'

export type { KlinePoint }

export interface FactorRow {
  code: string
  mom20: number | null
  rev5: number | null
  vol20: number | null
  composite: number | null
  rank: number
  lastClose: number
}

export interface BacktestConfig {
  initialCash: number
  lotSize: number
  commission: number
  minCommission: number
  stampTax: number
  slippage: number
}

export interface BacktestResult {
  nav: { date: string; value: number }[]
  totalReturn: number
  annualizedReturn: number
  maxDrawdown: number
  finalEquity: number
}

export interface QuantKlineBundle {
  /** 后复权（因子计算用） */
  adjusted: Record<string, KlinePoint[]>
  /** 原始未复权（真实持仓估值用） */
  raw: Record<string, KlinePoint[]>
}
