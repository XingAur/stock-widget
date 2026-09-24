/**
 * 量化因子与组合回测（自 a-share-quant 移植，K 线必须用后复权 hfq）。
 * 复合打分 = 0.7×动量(20日) + 0.3×反转(5日)，截面 zscore；波动率惩罚经实验证伪不采用。
 */

import type { KlinePoint } from '../api/stock'

export interface FactorRow {
  code: string
  mom20: number | null
  rev5: number | null
  vol20: number | null
  composite: number | null
  rank: number
  lastClose: number
}

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

/* ------------------------------------------------------------------ */
/* 组合回测：等权持有自选池，t 收盘信号 → t+1 开盘成交，A股规则成本与约束 */

export interface BacktestConfig {
  initialCash: number
  lotSize: number
  commission: number
  minCommission: number
  stampTax: number
  slippage: number
}

export const DEFAULT_BACKTEST_CONFIG: BacktestConfig = {
  initialCash: 1_000_000,
  lotSize: 100,
  commission: 0.0003,
  minCommission: 5,
  stampTax: 0.0005,
  slippage: 0.0005
}

export interface BacktestResult {
  nav: { date: string; value: number }[]
  totalReturn: number
  annualizedReturn: number
  maxDrawdown: number
  finalEquity: number
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

/* ------------------------------------------------------------------ */
/* K 线当日缓存：历史 K 线收盘后不变，当日内重复进入量化页不重复请求 */

import { fetchQuantKline, invokeSafe, normalizeKlinePoints, type KlinePoint as ApiKlinePoint } from '../api/stock'

const klineCache = new Map<string, { day: string; points: KlinePoint[] }>()

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

export interface QuantKlineBundle {
  /** 后复权（因子计算用） */
  adjusted: Record<string, KlinePoint[]>
  /** 原始未复权（真实持仓估值用，修 hfq 估值 bug） */
  raw: Record<string, KlinePoint[]>
}

const rawCache = new Map<string, { day: string; points: KlinePoint[] }>()

export async function loadQuantKlineBundle(codes: string[]): Promise<QuantKlineBundle> {
  const today = todayKey()
  const adjusted: Record<string, KlinePoint[]> = {}
  const raw: Record<string, KlinePoint[]> = {}
  const missing: string[] = []

  for (const code of codes) {
    const cachedAdj = klineCache.get(code)
    const cachedRaw = rawCache.get(code)
    if (cachedAdj && cachedAdj.day === today && cachedRaw && cachedRaw.day === today) {
      adjusted[code] = cachedAdj.points
      raw[code] = cachedRaw.points
    } else {
      missing.push(code)
    }
  }

  if (missing.length > 0) {
    const fetched = await Promise.all(
      missing.map(async (code) => {
        const [hfq, rawPoints] = await Promise.all([
          fetchQuantKline(code),
          invokeSafe<ApiKlinePoint[]>('fetch_kline_series', { code, ktype: 'day', adjust: 'qfq', count: 6 }, []).then((points) => normalizeKlinePoints(points))
        ])
        return [code, hfq, rawPoints] as const
      })
    )
    for (const [code, hfq, rawPoints] of fetched) {
      if (hfq.length > 0) {
        klineCache.set(code, { day: today, points: hfq })
        adjusted[code] = hfq
      }
      if (rawPoints.length > 0) {
        rawCache.set(code, { day: today, points: rawPoints })
        raw[code] = rawPoints
      }
    }
  }
  return { adjusted, raw }
}
