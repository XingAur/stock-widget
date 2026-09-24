/** 组合回测（阶段F-36，自 quant.ts 拆分；A股规则事件化引擎） */

import type { KlinePoint } from '../../api/stock'
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

export function isLimitUpDay(prevClose: number, close: number, code: string): boolean {
  const ratio = limitRatioOf(code)
  return prevClose > 0 && close >= prevClose * (1 + ratio) - 1e-6
}

export function isLimitDownDay(prevClose: number, close: number, code: string): boolean {
  const ratio = limitRatioOf(code)
  return prevClose > 0 && close <= prevClose * (1 - ratio) + 1e-6
}

function toDayBars(points: KlinePoint[], code: string): DayBar[] {
  const bars: DayBar[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    const prev = index > 0 ? points[index - 1].close : point.open
    // hfq 价与原始价同乘复权因子，比值判断与前收口径等价
    const limitUp = isLimitUpDay(prev, point.close, code)
    const limitDown = isLimitDownDay(prev, point.close, code)
    bars.push({
      date: point.time.slice(0, 10),
      open: point.open,
      close: point.close,
      prevClose: prev,
      limitUp,
      limitDown
    })
  }
  return bars
}

/** 等权组合回测：每个交易日把组合再平衡到等权（t-1 收盘信号 → t 开盘成交） */
export function runEqualWeightBacktest(
  klines: Record<string, KlinePoint[]>,
  config: BacktestConfig = DEFAULT_BACKTEST_CONFIG
): BacktestResult {
  const codes = Object.keys(klines).filter((code) => klines[code].length > 0)
  if (codes.length === 0) {
    return { nav: [], totalReturn: 0, annualizedReturn: 0, maxDrawdown: 0, finalEquity: config.initialCash }
  }

  const barsByCode: Record<string, Map<string, DayBar>> = {}
  for (const code of codes) {
    const map = new Map<string, DayBar>()
    for (const bar of toDayBars(klines[code], code)) {
      map.set(bar.date, bar)
    }
    barsByCode[code] = map
  }

  // 组合交易日历：所有票 K 线日期的并集
  const dateSet = new Set<string>()
  for (const code of codes) {
    for (const day of barsByCode[code].keys()) {
      dateSet.add(day)
    }
  }
  const dates = [...dateSet].sort()

  const targetWeight = 1 / codes.length
  let cash = config.initialCash
  const shares: Record<string, number> = {}
  const available: Record<string, number> = {}
  const lastKnownClose: Record<string, number> = {}
  const nav: { date: string; value: number }[] = []

  for (const day of dates) {
    // T+1：开盘时昨日买入的可卖
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

    // 调仓：目标等权（先卖后买，避免现金裁剪）
    const equityOpen = cash + markValue('open')
    const ordered = [...codes].sort()
    for (const code of ordered) {
      const bar = barsByCode[code].get(day)
      if (!bar || bar.open <= 0) {
        continue
      }
      const desiredNotional = targetWeight * equityOpen
      const desiredShares = Math.floor(desiredNotional / bar.open / config.lotSize) * config.lotSize
      const current = shares[code] ?? 0
      const delta = desiredShares - current

      if (delta < 0) {
        let qty = Math.min(-delta, available[code] ?? 0)
        qty = Math.floor(qty / config.lotSize) * config.lotSize
        if (qty <= 0 || bar.limitDown) {
          continue
        }
        const sellPrice = bar.open * (1 - config.slippage)
        const notional = sellPrice * qty
        const fee = Math.max(notional * config.commission, config.minCommission) + notional * config.stampTax
        cash += notional - fee
        shares[code] = current - qty
        available[code] = (available[code] ?? 0) - qty
        if (shares[code] <= 0) {
          delete shares[code]
          delete available[code]
        }
      }
    }
    for (const code of ordered) {
      const bar = barsByCode[code].get(day)
      if (!bar || bar.open <= 0 || bar.limitUp) {
        continue
      }
      const desiredNotional = targetWeight * equityOpen
      const desiredShares = Math.floor(desiredNotional / bar.open / config.lotSize) * config.lotSize
      const current = shares[code] ?? 0
      const delta = desiredShares - current
      if (delta <= 0) {
        continue
      }
      const buyPrice = bar.open * (1 + config.slippage)
      const notional = buyPrice * delta
      const fee = Math.max(notional * config.commission, config.minCommission)
      if (notional + fee > cash) {
        const affordable = Math.floor(
          (cash - config.minCommission) / (buyPrice * (1 + config.commission)) / config.lotSize
        ) * config.lotSize
        if (affordable <= 0) {
          continue
        }
        const adjustedNotional = buyPrice * affordable
        const adjustedFee = Math.max(adjustedNotional * config.commission, config.minCommission)
        if (adjustedNotional + adjustedFee > cash) {
          continue
        }
        cash -= adjustedNotional + adjustedFee
        shares[code] = current + affordable
        available[code] = (available[code] ?? 0)
        continue
      }
      cash -= notional + fee
      shares[code] = current + delta
    }

    const equityClose = cash + markValue('close')
    nav.push({ date: day, value: equityClose })
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
  return { nav, totalReturn, annualizedReturn, maxDrawdown, finalEquity }
}

