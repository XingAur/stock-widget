/**
 * 异动测算：判断「连续上涨到什么价格会触发交易所异常波动」，而不是只算涨停。
 *
 * 规则口径（沪深北交易所异常波动标准，按个股 3 个交易日累计涨跌幅近似，
 * 真实规则是「相对对应指数的偏离值」，客户端没有指数序列时按个股涨幅近似）：
 * - 主板：连续 3 个交易日累计涨跌幅达到 ±20%（ST/*ST 为 ±15%）
 * - 创业板 / 科创板：±30%
 * - 北交所：±30%
 *
 * 触发异动后公司需要发布异常波动公告，3 日窗口内继续上涨会维持异动状态，
 * 所以表格给出每天的「异动触发价」并与涨停价对比：涨停在异动价之上时，
 * 按涨停买入会先撞到异动；涨停在异动价之下时，涨停也不会触发异动。
 */
import type { KlinePoint } from '../api/stock'
import { getShanghaiClock } from './tradingSession'

export type BoardKind = 'main' | 'chinext' | 'star' | 'bse'
export type AbnormalStatus = 'already' | 'reachable' | 'unreachable' | 'unknown'

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] as const
const BOARD_LABELS: Record<BoardKind, string> = {
  main: '主板',
  chinext: '创业板',
  star: '科创板',
  bse: '北交所'
}

export function inferBoardKind(code: string): BoardKind {
  const plain = code.trim().replace(/^(sh|sz|bj)/i, '')
  if (/^(688|689)/.test(plain)) return 'star'
  if (/^(300|301|302)/.test(plain)) return 'chinext'
  if (/^(4|8|92)/.test(plain)) return 'bse'
  return 'main'
}

export function isStName(name: string): boolean {
  return /ST/i.test(name)
}

export function limitRatioForBoard(kind: BoardKind, isSt: boolean): number {
  // ST 只收紧主板：创业板/科创板即使 ST 仍是 20%，北交所没有 ST 特例。
  if (kind === 'main') return isSt ? 0.05 : 0.1
  if (kind === 'star' || kind === 'chinext') return 0.2
  return 0.3
}

/** 连续 3 个交易日累计涨跌幅的异常波动阈值（百分数，如 20 表示 20%）。 */
export function abnormalThresholdPercent(kind: BoardKind, isSt: boolean): number {
  if (kind === 'main') return isSt ? 15 : 20
  return 30
}

/** 交易所报价最小变动单位 0.01 元，按四舍五入取整（不是 JS 默认的浮点截断）。 */
export function roundTick(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = Number((Math.abs(value) * 100).toFixed(6))
  const rounded = Math.round(scaled)
  return Math.sign(value) * rounded / 100
}

export interface MoveEstimateRow {
  date: string
  weekday: string
  kind: 'past' | 'today' | 'future'
  /** 实际昨收 / 模拟昨收 */
  basePrice: number | null
  /** 收盘价 / 最新价 / 涨停价 */
  price: number | null
  /** 实际涨跌幅 / 涨停幅度 */
  changePercent: number | null
  limitUpPrice: number | null
  limitDownPrice: number | null
  limitUpPercent: number | null
  limitDownPercent: number | null
  /** 相对当前价的累计涨幅（连板路径） */
  cumulativePercent: number | null
  /** 当日收盘达到该价即触发异常波动 */
  abnormalPrice: number | null
  /** 相对当日模拟昨收，还差多少涨幅触发异动 */
  abnormalPercent: number | null
  /** already=现价已在异动窗口内；reachable=涨停会触发；unreachable=涨停也不触发 */
  abnormalStatus: AbnormalStatus
  /** 若当日涨停收盘，3 日累计涨幅会是多少 */
  limitUpCumulativePercent: number | null
}

export interface MoveEstimate {
  boardKind: BoardKind
  boardLabel: string
  limitPercent: number
  abnormalThresholdPercent: number
  /** 行情所属交易日（周末/盘前会回落到最近一个交易日） */
  referenceDate: string
  /** 以最新价为当日收盘时的 3 日累计涨幅 */
  currentCumulative3d: number | null
  /** 今日收盘达到该价即触发异动（用来判断现在是否已在异动区间） */
  currentAbnormalPrice: number | null
  /** 连续涨停第几天触发异动（null=未来 5 个交易日内不触发） */
  daysToAbnormal: number | null
  past: MoveEstimateRow[]
  today: MoveEstimateRow | null
  future: MoveEstimateRow[]
}

function parseYmd(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function formatYmd(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function weekdayOf(ymd: string): string {
  const date = parseYmd(ymd)
  return date ? WEEKDAYS[date.getDay()] : ''
}

export function nextTradingDay(ymd: string): string {
  const date = parseYmd(ymd)
  if (!date) return ymd
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() === 0 || date.getDay() === 6)
  return formatYmd(date)
}

export function todayYmdInShanghai(now: Date = new Date()): string {
  return getShanghaiClock(now).ymd
}

/** 腾讯行情时间字段是 YYYYMMDDHHMMSS；解析成交易日。 */
export function quoteTradeDate(time: string | undefined): string | null {
  if (!time) return null
  const digits = time.replace(/\D/g, '')
  if (digits.length < 8) return null
  const ymd = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  return parseYmd(ymd) ? ymd : null
}

function percentChange(price: number, base: number): number | null {
  if (!Number.isFinite(price) || !Number.isFinite(base) || base <= 0) return null
  return (price / base - 1) * 100
}

export interface BuildMoveEstimateInput {
  code: string
  name: string
  price: number
  changePercent: number
  prevClose: number
  dayPoints: readonly KlinePoint[]
  /** 行情时间（腾讯 YYYYMMDDHHMMSS），用于周末/盘前回落到最近交易日 */
  quoteTime?: string
  todayYmd?: string
  pastDays?: number
  futureDays?: number
}

export function buildMoveEstimate(input: BuildMoveEstimateInput): MoveEstimate {
  const calendarToday = input.todayYmd ?? todayYmdInShanghai()
  const quoteDate = quoteTradeDate(input.quoteTime)
  // 周末或盘前：行情还停留在上一个交易日，用行情日期作为「今天」更准确。
  const referenceDate = quoteDate && quoteDate <= calendarToday ? quoteDate : calendarToday
  const pastDays = input.pastDays ?? 5
  const futureDays = input.futureDays ?? 5
  const boardKind = inferBoardKind(input.code)
  const isSt = isStName(input.name)
  const ratio = limitRatioForBoard(boardKind, isSt)
  const threshold = abnormalThresholdPercent(boardKind, isSt)

  const closes = input.dayPoints
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && /^\d{4}-\d{2}-\d{2}/.test(point.time))
    .map((point) => ({ date: point.time.slice(0, 10), close: point.close }))
    .sort((left, right) => left.date.localeCompare(right.date))

  const pastCloses = closes.filter((point) => point.date < referenceDate)
  const pastRows: MoveEstimateRow[] = []
  for (let index = Math.max(0, pastCloses.length - pastDays); index < pastCloses.length; index += 1) {
    const current = pastCloses[index]
    const previous = index > 0 ? pastCloses[index - 1] : undefined
    pastRows.push({
      date: current.date,
      weekday: weekdayOf(current.date),
      kind: 'past',
      basePrice: previous?.close ?? null,
      price: current.close,
      changePercent: previous ? percentChange(current.close, previous.close) : null,
      limitUpPrice: null,
      limitDownPrice: null,
      limitUpPercent: null,
      limitDownPercent: null,
      cumulativePercent: null,
      abnormalPrice: null,
      abnormalPercent: null,
      abnormalStatus: 'unknown',
      limitUpCumulativePercent: null
    })
  }

  const quotePrice = Number.isFinite(input.price) && input.price > 0
    ? input.price
    : (pastCloses[pastCloses.length - 1]?.close ?? 0)

  // 连续上涨场景要用到「3 个交易日前」的收盘价，因此把历史收盘 + 今日价 + 模拟值拼成一条序列。
  const series: number[] = pastCloses.map((point) => point.close)
  const todayIndex = series.length
  series.push(quotePrice)
  const currentWindowBase = todayIndex >= 3 ? series[todayIndex - 3] : null
  const currentCumulative3d = currentWindowBase !== null
    ? percentChange(quotePrice, currentWindowBase)
    : null
  const currentAbnormalPrice = currentWindowBase !== null && currentWindowBase > 0
    ? roundTick(currentWindowBase * (1 + threshold / 100))
    : null

  const todayRow: MoveEstimateRow | null = quotePrice > 0
    ? {
        date: referenceDate,
        weekday: weekdayOf(referenceDate),
        kind: 'today',
        basePrice: input.prevClose > 0 ? input.prevClose : null,
        price: quotePrice,
        changePercent: Number.isFinite(input.changePercent) ? input.changePercent : percentChange(quotePrice, input.prevClose),
        limitUpPrice: input.prevClose > 0 ? roundTick(input.prevClose * (1 + ratio)) : null,
        limitDownPrice: input.prevClose > 0 ? roundTick(input.prevClose * (1 - ratio)) : null,
        limitUpPercent: null,
        limitDownPercent: null,
        cumulativePercent: 0,
        abnormalPrice: null,
        abnormalPercent: null,
        abnormalStatus: currentCumulative3d !== null && currentCumulative3d >= threshold ? 'already' : 'unknown',
        limitUpCumulativePercent: null
      }
    : null

  const startPrice = todayRow?.price ?? quotePrice
  const futureRows: MoveEstimateRow[] = []
  let simulatedPrevClose = startPrice
  let cursor = referenceDate
  let daysToAbnormal: number | null = null

  for (let index = 0; index < futureDays && simulatedPrevClose > 0; index += 1) {
    cursor = nextTradingDay(cursor)
    const limitUpPrice = roundTick(simulatedPrevClose * (1 + ratio))
    const limitDownPrice = roundTick(simulatedPrevClose * (1 - ratio))
    const seriesIndex = series.length
    series.push(limitUpPrice)

    const windowBase = seriesIndex >= 3 ? series[seriesIndex - 3] : null
    const abnormalPrice = windowBase !== null && windowBase > 0
      ? roundTick(windowBase * (1 + threshold / 100))
      : null
    const abnormalPercent = abnormalPrice !== null
      ? percentChange(abnormalPrice, simulatedPrevClose)
      : null
    const limitUpCumulativePercent = windowBase !== null
      ? percentChange(limitUpPrice, windowBase)
      : null

    let abnormalStatus: AbnormalStatus = 'unknown'
    if (abnormalPrice !== null) {
      if (abnormalPrice <= simulatedPrevClose) {
        // 昨收就已经在异动区间内：当天只要不跌破异动价就仍然算异动
        abnormalStatus = 'already'
      } else if (abnormalPrice <= limitUpPrice) {
        abnormalStatus = 'reachable'
        if (daysToAbnormal === null) daysToAbnormal = index + 1
      } else {
        abnormalStatus = 'unreachable'
      }
    }

    futureRows.push({
      date: cursor,
      weekday: weekdayOf(cursor),
      kind: 'future',
      basePrice: roundTick(simulatedPrevClose),
      price: limitUpPrice,
      changePercent: percentChange(limitUpPrice, simulatedPrevClose),
      limitUpPrice,
      limitDownPrice,
      limitUpPercent: percentChange(limitUpPrice, simulatedPrevClose),
      limitDownPercent: percentChange(limitDownPrice, simulatedPrevClose),
      cumulativePercent: percentChange(limitUpPrice, startPrice),
      abnormalPrice,
      abnormalPercent,
      abnormalStatus,
      limitUpCumulativePercent
    })
    simulatedPrevClose = limitUpPrice
  }

  return {
    boardKind,
    boardLabel: BOARD_LABELS[boardKind],
    limitPercent: Number((ratio * 100).toFixed(2)),
    abnormalThresholdPercent: threshold,
    referenceDate,
    currentCumulative3d,
    currentAbnormalPrice,
    daysToAbnormal,
    past: pastRows,
    today: todayRow,
    future: futureRows
  }
}
