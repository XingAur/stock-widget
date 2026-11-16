/**
 * 异动测算：个股前后一周的涨跌幅度与涨跌停阶梯。
 * 过去一周用真实日线收盘价，未来一周用「模拟昨收 → 涨停价」逐日递推，
 * 与常见行情软件的「连续涨停测算」口径一致（价格按 0.01 元取整后再算幅度）。
 */
import type { KlinePoint } from '../api/stock'
import { getShanghaiClock } from './tradingSession'

export type BoardKind = 'main' | 'chinext' | 'star' | 'bse'

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
  if (isSt) return kind === 'main' ? 0.05 : kind === 'bse' ? 0.3 : 0.2
  if (kind === 'star' || kind === 'chinext') return 0.2
  if (kind === 'bse') return 0.3
  return 0.1
}

/** A 股报价最小变动单位 0.01 元，四舍五入到分。 */
export function roundTick(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
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
  /** 相对当前价的累计幅度（涨停路径） */
  cumulativePercent: number | null
}

export interface MoveEstimate {
  boardKind: BoardKind
  boardLabel: string
  ratio: number
  limitPercent: number
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
  todayYmd?: string
  pastDays?: number
  futureDays?: number
}

export function buildMoveEstimate(input: BuildMoveEstimateInput): MoveEstimate {
  const todayYmd = input.todayYmd ?? todayYmdInShanghai()
  const pastDays = input.pastDays ?? 5
  const futureDays = input.futureDays ?? 5
  const boardKind = inferBoardKind(input.code)
  const ratio = limitRatioForBoard(boardKind, isStName(input.name))

  const closes = input.dayPoints
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && /^\d{4}-\d{2}-\d{2}/.test(point.time))
    .map((point) => ({ date: point.time.slice(0, 10), close: point.close }))
    .sort((left, right) => left.date.localeCompare(right.date))

  const pastRows: MoveEstimateRow[] = []
  const pastCloses = closes.filter((point) => point.date < todayYmd)
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
      cumulativePercent: null
    })
  }

  const quotePrice = Number.isFinite(input.price) && input.price > 0
    ? input.price
    : (pastCloses[pastCloses.length - 1]?.close ?? 0)
  const todayRow: MoveEstimateRow | null = quotePrice > 0
    ? {
        date: todayYmd,
        weekday: weekdayOf(todayYmd),
        kind: 'today',
        basePrice: input.prevClose > 0 ? input.prevClose : null,
        price: quotePrice,
        changePercent: Number.isFinite(input.changePercent) ? input.changePercent : percentChange(quotePrice, input.prevClose),
        limitUpPrice: input.prevClose > 0 ? roundTick(input.prevClose * (1 + ratio)) : null,
        limitDownPrice: input.prevClose > 0 ? roundTick(input.prevClose * (1 - ratio)) : null,
        limitUpPercent: null,
        limitDownPercent: null,
        cumulativePercent: 0
      }
    : null

  const startPrice = todayRow?.price ?? quotePrice
  const futureRows: MoveEstimateRow[] = []
  let simulatedPrevClose = startPrice
  let cursor = todayYmd
  for (let index = 0; index < futureDays && simulatedPrevClose > 0; index += 1) {
    cursor = nextTradingDay(cursor)
    const limitUpPrice = roundTick(simulatedPrevClose * (1 + ratio))
    const limitDownPrice = roundTick(simulatedPrevClose * (1 - ratio))
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
      cumulativePercent: percentChange(limitUpPrice, startPrice)
    })
    simulatedPrevClose = limitUpPrice
  }

  return {
    boardKind,
    boardLabel: BOARD_LABELS[boardKind],
    ratio,
    limitPercent: Number((ratio * 100).toFixed(2)),
    past: pastRows,
    today: todayRow,
    future: futureRows
  }
}
