/**
 * 严重异常波动（严重异动）测算。
 *
 * 规则依据（交易所公开规则）：
 * - 连续 10 个交易日内日收盘价涨跌幅偏离值累计达到 +100%（-50%）
 * - 连续 30 个交易日内日收盘价涨跌幅偏离值累计达到 +200%（-70%）
 * - 连续同向异常波动次数：沪深主板 10 个交易日内 4 次；创业板/科创板 10 个交易日内 3 次（本工具另计）
 *
 * 偏离值公式：
 *   累计偏离值 = 个股 N 日累计涨跌幅 − 对应基准指数 N 日累计涨跌幅
 *   基准指数：沪市主板 上证A指(sh000002)、深市主板 深证A指(sz399107)、
 *             创业板 创业板综(sz399102)、科创板 科创50(sh000688)
 *
 * 模拟口径（与同类「异动测算」工具一致）：
 * - 未来交易日指数按最新点位不变；
 * - 某日若会触发阈值，则当日按「不触发最高价」（触发价 - 0.01）推演次日。
 */
import type { KlinePoint } from '../api/stock'
import { getShanghaiClock } from './tradingSession'

export type BoardKind = 'sh-main' | 'sz-main' | 'chinext' | 'star' | 'bse'

export interface BoardProfile {
  kind: BoardKind
  label: string
  indexCode: string
  indexName: string
  /** 涨跌幅限制 */
  limitRatio: number
  /** 10 个交易日内同向异常波动次数上限 */
  sameDirectionLimit: number
  /** 普通异常波动：连续 3 日累计偏离阈值（百分比） */
  abnormal3dThreshold: number
}

export interface SevereRule {
  days: number
  upperPercent: number
  lowerPercent: number
}

export const SEVERE_RULES: readonly SevereRule[] = [
  { days: 10, upperPercent: 100, lowerPercent: -50 },
  { days: 30, upperPercent: 200, lowerPercent: -70 }
]

export interface SevereCell {
  kind: 'limit' | 'trigger' | 'unknown'
  /** 涨停价（kind=limit）或触发价（kind=trigger） */
  price: number | null
  /** 涨停涨幅或首次触发涨幅（百分比） */
  percent: number | null
  /** 当日模拟昨收 */
  prevClose: number
  badge: string
}

export interface SevereRow {
  date: string
  weekday: string
  /** 与 SEVERE_RULES 顺序一致 */
  cells: SevereCell[]
  /** 该交易日按连续涨停推演是否新增同向异常波动（3 日累计偏离达阈值） */
  sameDirectionEvent: 'up' | 'down' | null
}

export interface SameDirectionStatus {
  /** 近 10 个交易日内向上的 3 日异常波动次数 */
  up: number
  /** 近 10 个交易日内向下的 3 日异常波动次数 */
  down: number
  /** 次数上限：沪深主板 4 次，创业板/科创板 3 次 */
  limit: number
  /** 今日收盘已因同向次数达到上限而触发严重异动 */
  reached: boolean
  /** 按连续涨停推演，第几个交易日达到次数上限（null=未来 N 日内不会达到） */
  projectedTriggerDay: number | null
}

export interface SevereTodayStatus {
  date: string
  /** 与 SEVERE_RULES 顺序一致：今日涨停是否会触发该规则 */
  badges: string[]
  triggered: boolean
}

export interface SevereEstimate {
  profile: BoardProfile
  indexLastClose: number | null
  indexReady: boolean
  today: SevereTodayStatus
  sameDirection: SameDirectionStatus
  rows: SevereRow[]
}

export function toPlainCode(code: string): string {
  return code.trim().toLowerCase().replace(/^(sh|sz|bj)/, '')
}

export function isStName(name: string): boolean {
  return /ST/i.test(name)
}

export function boardProfile(code: string, name: string): BoardProfile {
  const plain = toPlainCode(code)
  const isSt = isStName(name)
  if (/^(600|601|603|605)/.test(plain)) {
    return {
      kind: 'sh-main', label: '沪市主板', indexCode: 'sh000002', indexName: '上证A指',
      limitRatio: isSt ? 0.05 : 0.1, sameDirectionLimit: 4, abnormal3dThreshold: isSt ? 12 : 20
    }
  }
  if (/^(000|001|002|003)/.test(plain)) {
    return {
      kind: 'sz-main', label: '深市主板', indexCode: 'sz399107', indexName: '深证A指',
      limitRatio: isSt ? 0.05 : 0.1, sameDirectionLimit: 4, abnormal3dThreshold: isSt ? 12 : 20
    }
  }
  if (/^(300|301|302)/.test(plain)) {
    return {
      kind: 'chinext', label: '创业板', indexCode: 'sz399102', indexName: '创业板综',
      limitRatio: 0.2, sameDirectionLimit: 3, abnormal3dThreshold: 30
    }
  }
  if (/^(688|689)/.test(plain)) {
    return {
      kind: 'star', label: '科创板', indexCode: 'sh000688', indexName: '科创50',
      limitRatio: 0.2, sameDirectionLimit: 3, abnormal3dThreshold: 30
    }
  }
  return {
    kind: 'bse', label: '北交所', indexCode: 'bj899050', indexName: '北证50',
    limitRatio: 0.3, sameDirectionLimit: 3, abnormal3dThreshold: 30
  }
}

/** 交易所报价最小变动单位 0.01 元，四舍五入到分。 */
export function roundTick(value: number): number {
  if (!Number.isFinite(value)) return 0
  const scaled = Number((Math.abs(value) * 100).toFixed(6))
  return Math.sign(value) * Math.round(scaled) / 100
}

export function weekdayOf(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!match) return ''
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][date.getDay()] ?? ''
}

export function nextTradingDay(ymd: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!match) return ymd
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  do {
    date.setDate(date.getDate() + 1)
  } while (date.getDay() === 0 || date.getDay() === 6)
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-')
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
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : null
}

interface PricePoint {
  date: string
  close: number
}

function normalizePoints(points: readonly KlinePoint[]): PricePoint[] {
  return points
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && /^\d{4}-\d{2}-\d{2}/.test(point.time))
    .map((point) => ({ date: point.time.slice(0, 10), close: point.close }))
    .sort((left, right) => left.date.localeCompare(right.date))
}

export interface BuildSevereEstimateInput {
  code: string
  name: string
  price: number
  prevClose: number
  dayPoints: readonly KlinePoint[]
  indexPoints: readonly KlinePoint[]
  quoteTime?: string
  todayYmd?: string
  /** 模拟多少个未来交易日 */
  days?: number
}

export function buildSevereEstimate(input: BuildSevereEstimateInput): SevereEstimate {
  const calendarToday = input.todayYmd ?? todayYmdInShanghai()
  const quoteDate = quoteTradeDate(input.quoteTime)
  const referenceDate = quoteDate && quoteDate <= calendarToday ? quoteDate : calendarToday
  const profile = boardProfile(input.code, input.name)
  const days = Math.max(1, Math.min(input.days ?? 15, 30))

  const stockPoints = normalizePoints(input.dayPoints)
  const pastStock = stockPoints.filter((point) => point.date < referenceDate)
  const indexPoints = normalizePoints(input.indexPoints)
  const pastIndex = new Map(indexPoints.filter((point) => point.date < referenceDate).map((point) => [point.date, point.close]))
  const indexLast = indexPoints.filter((point) => point.date <= referenceDate).at(-1)?.close ?? null

  const price = Number.isFinite(input.price) && input.price > 0
    ? input.price
    : (pastStock.at(-1)?.close ?? 0)

  const stockDates = [...pastStock.map((point) => point.date), referenceDate]
  const stockSeries = [...pastStock.map((point) => point.close), price]
  const todayIdx = stockSeries.length - 1

  const indexOn = (date: string): number | null => {
    if (date >= referenceDate) return indexLast
    return pastIndex.get(date) ?? null
  }

  /** 计算某窗口在 date 收盘时触发 rule 的临界价（指数按最新点位视为不变）。 */
  const criticalPrice = (rule: SevereRule, baseIdx: number, stockPath: number[], pathDates: string[]): number | null => {
    if (baseIdx < 0 || baseIdx >= stockPath.length) return null
    const base = stockPath[baseIdx]
    const baseDate = pathDates[baseIdx]
    const i0 = indexOn(baseDate)
    if (!base || !i0 || !indexLast) return null
    const indexReturn = indexLast / i0 - 1
    return roundTick(base * (1 + rule.upperPercent / 100 + indexReturn))
  }

  const todayBadges = SEVERE_RULES.map((rule) => {
    const critical = criticalPrice(rule, todayIdx - rule.days, stockSeries, stockDates)
    if (critical === null) return '数据不足'
    const limitUp = input.prevClose > 0 ? roundTick(input.prevClose * (1 + profile.limitRatio)) : null
    if (limitUp === null) return '数据不足'
    return limitUp >= critical ? `今日涨停触发${rule.upperPercent}%规则` : `今日涨停不触发${rule.upperPercent}%规则`
  })
  const todayTriggered = SEVERE_RULES.some((rule) => {
    const critical = criticalPrice(rule, todayIdx - rule.days, stockSeries, stockDates)
    return critical !== null && price >= critical
  })

  const abnormalThreshold = profile.abnormal3dThreshold

  /** 3 日累计偏离值（个股 − 基准指数），单位：百分比 */
  const deviation3 = (path: number[], dates: string[], endIdx: number): number | null => {
    if (endIdx < 3) return null
    const startPrice = path[endIdx - 3]
    const endPrice = path[endIdx]
    const startIndex = indexOn(dates[endIdx - 3])
    const endIndexValue = indexOn(dates[endIdx])
    if (!startPrice || !endPrice || !startIndex || !endIndexValue) return null
    return (endPrice / startPrice - 1) * 100 - (endIndexValue / startIndex - 1) * 100
  }

  const countEvents = (path: number[], dates: string[], endIdx: number, window: number) => {
    let up = 0
    let down = 0
    for (let idx = Math.max(3, endIdx - window + 1); idx <= endIdx; idx += 1) {
      const deviation = deviation3(path, dates, idx)
      if (deviation === null) continue
      if (deviation >= abnormalThreshold) up += 1
      else if (deviation <= -abnormalThreshold) down += 1
    }
    return { up, down }
  }

  const actualCounts = countEvents(stockSeries, stockDates, todayIdx, 10)

  // 近 10 个交易日里已经发生的「向上」异常波动，参与同向次数推演的滚动窗口
  const actualUpEventIndices: number[] = []
  for (let idx = Math.max(3, todayIdx - 9); idx <= todayIdx; idx += 1) {
    const deviation = deviation3(stockSeries, stockDates, idx)
    if (deviation !== null && deviation >= abnormalThreshold) actualUpEventIndices.push(idx)
  }

  // 同向次数推演：假设每个交易日都涨停，滚动 10 日统计 3 日异常波动次数
  const projectionPath = [...stockSeries]
  const projectionDates = [...stockDates]
  const projectedEvents: number[] = [...actualUpEventIndices]
  let projectedTriggerDay: number | null = null
  if (actualUpEventIndices.length >= profile.sameDirectionLimit) projectedTriggerDay = 0
  let projectedPrev = price
  let projectionCursor = referenceDate
  for (let k = 1; k <= days; k += 1) {
    projectionCursor = nextTradingDay(projectionCursor)
    projectedPrev = roundTick(projectedPrev * (1 + profile.limitRatio))
    projectionPath.push(projectedPrev)
    projectionDates.push(projectionCursor)
    const endIdx = projectionPath.length - 1
    const deviation = deviation3(projectionPath, projectionDates, endIdx)
    if (deviation === null) continue
    const upEvent = deviation >= abnormalThreshold
    const downEvent = deviation <= -abnormalThreshold
    if (upEvent || downEvent) projectedEvents.push(endIdx)
    const windowEvents = projectedEvents.filter((idx) => idx > endIdx - 10)
    if (projectedTriggerDay === null && windowEvents.length >= profile.sameDirectionLimit) {
      projectedTriggerDay = k
    }
  }

  const rows: SevereRow[] = []
  const ruleStates = SEVERE_RULES.map((rule) => ({
    rule,
    path: [...stockSeries],
    dates: [...stockDates],
    prev: price
  }))

  // 只在该交易日「首次达到同向异动次数上限」时打标，避免连续涨停后每天重复标记
  const eventByDate = new Map<string, 'up' | 'down'>()
  if (projectedTriggerDay !== null && projectedTriggerDay > 0) {
    const triggerIdx = stockSeries.length + projectedTriggerDay - 1
    const deviation = deviation3(projectionPath, projectionDates, triggerIdx)
    const triggerDate = projectionDates[triggerIdx]
    if (triggerDate && deviation !== null) {
      eventByDate.set(triggerDate, deviation >= 0 ? 'up' : 'down')
    }
  }

  let cursor = referenceDate
  for (let k = 0; k < days; k += 1) {
    cursor = nextTradingDay(cursor)
    const cells: SevereCell[] = ruleStates.map((state) => {
      const idx = state.path.length
      const critical = criticalPrice(state.rule, idx - state.rule.days, state.path, state.dates)
      const limitUp = state.prev > 0 ? roundTick(state.prev * (1 + profile.limitRatio)) : null
      if (critical === null || limitUp === null) {
        state.path.push(state.prev)
        state.dates.push(cursor)
        return { kind: 'unknown', price: null, percent: null, prevClose: state.prev, badge: '数据不足' }
      }
      const cell: SevereCell = critical <= limitUp
        ? {
            kind: 'trigger',
            price: critical,
            percent: (critical / state.prev - 1) * 100,
            prevClose: state.prev,
            badge: '达到即触发'
          }
        : {
            kind: 'limit',
            price: limitUp,
            percent: (limitUp / state.prev - 1) * 100,
            prevClose: state.prev,
            badge: '涨停不触发'
          }
      // 触发日按「不触发最高价」推演次日：触发价 - 0.01，且不低于当日模拟昨收
      const nextClose = cell.kind === 'trigger'
        ? Math.max(roundTick((cell.price as number) - 0.01), state.prev)
        : (cell.price as number)
      state.path.push(nextClose)
      state.dates.push(cursor)
      state.prev = nextClose
      return cell
    })
    rows.push({ date: cursor, weekday: weekdayOf(cursor), cells, sameDirectionEvent: eventByDate.get(cursor) ?? null })
  }

  return {
    profile,
    indexLastClose: indexLast,
    indexReady: Boolean(indexLast),
    today: { date: referenceDate, badges: todayBadges, triggered: todayTriggered },
    sameDirection: {
      up: actualCounts.up,
      down: actualCounts.down,
      limit: profile.sameDirectionLimit,
      reached: actualCounts.up >= profile.sameDirectionLimit || actualCounts.down >= profile.sameDirectionLimit,
      projectedTriggerDay
    },
    rows
  }
}
