/** 组合回测：t-1 收盘信号 → t 开盘成交；涨跌停只用开盘相对前收判断 */

import type { KlinePoint } from '../../api/stock'
import { computeFactorRows } from './factors'
import { selectTopN, type TopNOption } from './selector'
import type { BacktestConfig, BacktestResult } from './types'

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCash: 1_000_000,
  lotSize: 100,
  commission: 0.0003,
  minCommission: 5,
  stampTax: 0.0005,
  slippage: 0.0005
}

const BOARD_LIMIT_RATIO: Record<string, number> = { main: 0.1, star: 0.2, chinext: 0.2, bse: 0.3 }

function boardOf(code: string): string {
  const digits = code.replace(/\D/g, '')
  if (digits.startsWith('688') || digits.startsWith('689')) {
    return 'star'
  }
  if (digits.startsWith('300') || digits.startsWith('301') || digits.startsWith('302')) {
    return 'chinext'
  }
  if (code.startsWith('bj') || digits.startsWith('4') || digits.startsWith('8') || digits.startsWith('92')) {
    return 'bse'
  }
  return 'main'
}

export function limitRatioOf(code: string): number {
  return BOARD_LIMIT_RATIO[boardOf(code)] ?? 0.1
}

interface DayBar {
  date: string
  open: number
  close: number
  prevClose: number
  limitUp: boolean
  limitDown: boolean
}

export function isLimitUpDay(prevClose: number, price: number, code: string): boolean {
  const ratio = limitRatioOf(code)
  return prevClose > 0 && price >= prevClose * (1 + ratio) - 1e-6
}

export function isLimitDownDay(prevClose: number, price: number, code: string): boolean {
  const ratio = limitRatioOf(code)
  return prevClose > 0 && price <= prevClose * (1 - ratio) + 1e-6
}

function toDayBars(points: KlinePoint[], code: string): DayBar[] {
  const bars: DayBar[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const prev = index > 0 ? points[index - 1].close : point.open
    bars.push({
      date: point.time.slice(0, 10),
      open: point.open,
      close: point.close,
      prevClose: prev,
      limitUp: isLimitUpDay(prev, point.open, code),
      limitDown: isLimitDownDay(prev, point.open, code)
    })
  }
  return bars
}

function sliceToDate(points: KlinePoint[], asOf: string): KlinePoint[] {
  return points.filter((point) => point.time.slice(0, 10) <= asOf)
}

type WeightMap = Record<string, number>

function runWeightedBacktest(
  klines: Record<string, KlinePoint[]>,
  weightsForDay: (prevDay: string | null, dayIndex: number) => WeightMap,
  config: BacktestConfig
): BacktestResult {
  const codes = Object.keys(klines).filter((code) => klines[code].length > 0)
  if (codes.length === 0) {
    return { nav: [], totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, finalEquity: config.initialCash, sharpe: null, calmar: null, turnover: 0 }
  }

  const barsByCode: Record<string, Map<string, DayBar>> = {}
  for (const code of codes) {
    const map = new Map<string, DayBar>()
    for (const bar of toDayBars(klines[code], code)) {
      map.set(bar.date, bar)
    }
    barsByCode[code] = map
  }

  const dateSet = new Set<string>()
  for (const code of codes) {
    for (const day of barsByCode[code].keys()) {
      dateSet.add(day)
    }
  }
  const dates = [...dateSet].sort()

  let cash = config.initialCash
  const shares: Record<string, number> = {}
  const available: Record<string, number> = {}
  const lastKnownClose: Record<string, number> = {}
  const nav: { date: string; value: number }[] = []
  let traded = 0

  for (let index = 0; index < dates.length; index += 1) {
    const day = dates[index]
    const prevDay = index > 0 ? dates[index - 1] : null
    for (const code of Object.keys(shares)) {
      available[code] = shares[code]
    }

    for (const code of codes) {
      const bar = barsByCode[code].get(day)
      if (bar && bar.close > 0) {
        lastKnownClose[code] = bar.close
      }
    }

    const markValue = (priceField: 'open' | 'close') => {
      let total = 0
      for (const code of Object.keys(shares)) {
        const bar = barsByCode[code].get(day)
        const price = bar && bar[priceField] > 0 ? bar[priceField] : lastKnownClose[code] ?? 0
        total += shares[code] * price
      }
      return total
    }

    const weights = weightsForDay(prevDay, index)
    const equityOpen = cash + markValue('open')
    const universe = [...new Set([...codes, ...Object.keys(shares), ...Object.keys(weights)])].sort()

    for (const code of universe) {
      const bar = barsByCode[code]?.get(day)
      if (!bar || bar.open <= 0) {
        continue
      }
      const desiredNotional = (weights[code] ?? 0) * equityOpen
      const desiredShares = Math.floor(desiredNotional / bar.open / config.lotSize) * config.lotSize
      const current = shares[code] ?? 0
      const delta = desiredShares - current
      if (delta >= 0) {
        continue
      }
      let qty = Math.min(-delta, available[code] ?? 0)
      qty = Math.floor(qty / config.lotSize) * config.lotSize
      if (qty <= 0 || bar.limitDown) {
        continue
      }
      const sellPrice = bar.open * (1 - config.slippage)
      const notional = sellPrice * qty
      const fee = Math.max(notional * config.commission, config.minCommission) + notional * config.stampTax
      traded += notional
      cash += notional - fee
      shares[code] = current - qty
      available[code] = (available[code] ?? 0) - qty
      if (shares[code] <= 0) {
        delete shares[code]
        delete available[code]
      }
    }

    for (const code of universe) {
      const bar = barsByCode[code]?.get(day)
      if (!bar || bar.open <= 0 || bar.limitUp) {
        continue
      }
      const desiredNotional = (weights[code] ?? 0) * equityOpen
      const desiredShares = Math.floor(desiredNotional / bar.open / config.lotSize) * config.lotSize
      const current = shares[code] ?? 0
      const delta = desiredShares - current
      if (delta <= 0) {
        continue
      }
      const buyPrice = bar.open * (1 + config.slippage)
      const tryBuy = (qty: number) => {
        const tradeNotional = buyPrice * qty
        const tradeFee = Math.max(tradeNotional * config.commission, config.minCommission)
        if (tradeNotional + tradeFee > cash) {
          return false
        }
        traded += tradeNotional
        cash -= tradeNotional + tradeFee
        shares[code] = current + qty
        available[code] = available[code] ?? 0
        return true
      }
      if (!tryBuy(delta)) {
        const affordable = Math.floor(
          (cash - config.minCommission) / (buyPrice * (1 + config.commission)) / config.lotSize
        ) * config.lotSize
        if (affordable > 0) {
          tryBuy(affordable)
        }
      }
    }

    nav.push({ date: day, value: cash + markValue('close') })
  }

  const finalEquity = nav.length > 0 ? nav[nav.length - 1].value : config.initialCash
  const totalReturn = finalEquity / config.initialCash - 1
  const years = nav.length / 244
  const annualizedReturn = years > 0 ? (1 + totalReturn) ** (1 / years) - 1 : 0
  let peak = -Infinity
  let maxDrawdown = 0
  for (const point of nav) {
    peak = Math.max(peak, point.value)
    if (peak > 0) {
      maxDrawdown = Math.min(maxDrawdown, point.value / peak - 1)
    }
  }
  const returns: number[] = []
  for (let index = 1; index < nav.length; index += 1) {
    const prev = nav[index - 1].value
    if (prev > 0) {
      returns.push(nav[index].value / prev - 1)
    }
  }
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / returns.length
    : 0
  const std = Math.sqrt(variance)
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(244) : null
  const calmar = maxDrawdown < 0 ? annualizedReturn / Math.abs(maxDrawdown) : null
  const turnover = config.initialCash > 0 ? traded / config.initialCash / Math.max(dates.length, 1) : 0
  return { nav, totalReturn, annualizedReturn, maxDrawdown, finalEquity, sharpe, calmar, turnover }
}

/** 等权基准：每个交易日把组合再平衡到全池等权（t-1 收盘信号 → t 开盘成交） */
export function runEqualWeightBacktest(
  klines: Record<string, KlinePoint[]>,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG
): BacktestResult {
  const codes = Object.keys(klines).filter((code) => klines[code].length > 0)
  const weight = codes.length ? 1 / codes.length : 0
  const weights: WeightMap = {}
  for (const code of codes) {
    weights[code] = weight
  }
  return runWeightedBacktest(klines, () => weights, config)
}

/** 因子 Top-N：只用 as-of 当日及之前的 K 线评分，下一交易日开盘成交 */
export function runFactorTopNBacktest(
  klines: Record<string, KlinePoint[]>,
  topN: TopNOption,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG,
  rebalanceEvery = 5
): BacktestResult {
  let held: WeightMap = {}
  return runWeightedBacktest(
    klines,
    (prevDay, dayIndex) => {
      if (!prevDay) {
        return {}
      }
      if (rebalanceEvery > 1 && dayIndex % rebalanceEvery !== 1 && Object.keys(held).length > 0) {
        return held
      }
      const history: Record<string, KlinePoint[]> = {}
      for (const [code, points] of Object.entries(klines)) {
        const sliced = sliceToDate(points, prevDay)
        if (sliced.length) {
          history[code] = sliced
        }
      }
      const selected = selectTopN(computeFactorRows(history), topN, 'score')
      const weights: WeightMap = {}
      selected.weights.forEach((value, code) => {
        weights[code] = value
      })
      held = weights
      return weights
    },
    config
  )
}
