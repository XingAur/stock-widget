import type { KlinePoint, StockAnnouncement } from '../api/stock'
import { getShanghaiClock } from './tradingSession'

export type Direction = 'up' | 'down'
export type BoardKind = 'sh-main' | 'sz-main' | 'chinext' | 'star' | 'bse'

interface SevereRule {
  days: number
  up: number
  down: number
}

export interface BoardProfile {
  kind: BoardKind
  label: string
  indexCode: string
  indexName: string
  limitRatio: number
  sameDirectionLimit: number
  abnormal3dThreshold: number
  turnoverRule: boolean
  ipoNoLimitDays: number
  severeRules: readonly SevereRule[]
}

const RULE_CHANGE = '2026-07-06'
const MAIN_SEVERE_RULES = [{ days: 10, up: 100, down: -50 }, { days: 30, up: 200, down: -70 }]
const BSE_SEVERE_RULES = [{ days: 10, up: 150, down: -60 }, { days: 30, up: 300, down: -75 }]
const DIRECTIONS: readonly Direction[] = ['up', 'down']

export function boardProfile(code: string, name: string, date = RULE_CHANGE): BoardProfile {
  const plain = code.trim().toLowerCase().replace(/^(sh|sz|bj)/, '')
  const isShanghai = /^(600|601|603|605)/.test(plain)
  if (isShanghai || /^(000|001|002|003)/.test(plain)) {
    const legacySt = date < RULE_CHANGE && /^(?:\*?ST|S\*ST)/i.test(name.trim())
    return {
      kind: isShanghai ? 'sh-main' : 'sz-main',
      label: isShanghai ? '沪市主板' : '深市主板',
      indexCode: isShanghai ? 'sh000002' : 'sz399107',
      indexName: isShanghai ? '上证A指' : '深证A指',
      limitRatio: legacySt ? 0.05 : 0.1,
      sameDirectionLimit: 4,
      abnormal3dThreshold: legacySt ? 12 : 20,
      turnoverRule: true,
      ipoNoLimitDays: 5,
      severeRules: MAIN_SEVERE_RULES
    }
  }
  if (/^(300|301|302|688|689)/.test(plain)) {
    const star = /^(688|689)/.test(plain)
    return {
      kind: star ? 'star' : 'chinext',
      label: star ? '科创板' : '创业板',
      indexCode: star ? 'sh000688' : 'sz399102',
      indexName: star ? '科创50' : '创业板综',
      limitRatio: 0.2, sameDirectionLimit: 3, abnormal3dThreshold: 30,
      turnoverRule: false, ipoNoLimitDays: 5, severeRules: MAIN_SEVERE_RULES
    }
  }
  return {
    kind: 'bse', label: '北交所', indexCode: 'bj899050', indexName: '北证50',
    limitRatio: 0.3, sameDirectionLimit: 3, abnormal3dThreshold: 40,
    turnoverRule: false, ipoNoLimitDays: 1, severeRules: BSE_SEVERE_RULES
  }
}

export function roundTick(value: number): number {
  return Math.round(Number((value * 100).toFixed(8))) / 100
}

// 2026 年交易所休市安排，2027 年按已公布的法定节假日推演。
const HOLIDAYS = [
  ['2026-01-01', '2026-01-03'], ['2026-02-15', '2026-02-23'], ['2026-04-04', '2026-04-06'],
  ['2026-05-01', '2026-05-05'], ['2026-06-19', '2026-06-21'], ['2026-09-25', '2026-09-27'],
  ['2026-10-01', '2026-10-07'], ['2027-01-01', '2027-01-03'], ['2027-02-05', '2027-02-13'],
  ['2027-04-03', '2027-04-05'], ['2027-05-01', '2027-05-05'], ['2027-06-09', '2027-06-09'],
  ['2027-09-15', '2027-09-15'], ['2027-10-01', '2027-10-07']
]

export function nextTradingDay(ymd: string): string {
  const date = new Date(`${ymd}T00:00:00Z`)
  if (!Number.isFinite(date.getTime())) return ymd
  let next: string
  do {
    date.setUTCDate(date.getUTCDate() + 1)
    next = date.toISOString().slice(0, 10)
  } while (date.getUTCDay() % 6 === 0 || HOLIDAYS.some(([start, end]) => next >= start && next <= end))
  return next
}

export function quoteTradeDate(time: string | undefined): string | null {
  const digits = time?.replace(/\D/g, '') ?? ''
  if (digits.length < 8) return null
  const date = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
  const parsed = new Date(`${date}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().startsWith(date) ? date : null
}

interface WindowBase {
  baseDate: string
  stockBase: number
  indexBase: number
}

interface TradingDay extends WindowBase {
  date: string
  price: number
  index: number
  turnoverRate?: number
  restart: boolean
}

export interface Deviation {
  baseDate: string
  stockReturn: number
  indexReturn: number
  value: number
}

export interface TriggerLine {
  threshold: number
  current: Deviation | null
  fullWindow: Deviation | null
  price: number | null
  changePercent: number | null
  baseDate: string | null
  limitPrice: number | null
  reached: boolean
  reachable: boolean
}

interface SevereRow {
  date: string
  up: TriggerLine[]
  down: TriggerLine[]
}

export interface BuildSevereEstimateInput {
  code: string
  name: string
  price: number
  prevClose: number
  volume?: number
  turnoverRate?: number
  limitUp?: number | null
  limitDown?: number | null
  hasPriceLimit?: boolean | null
  listingDate?: string
  announcements?: readonly StockAnnouncement[]
  dayPoints: readonly KlinePoint[]
  indexPoints: readonly KlinePoint[]
  quoteTime?: string
  todayYmd?: string
  days?: number
}

function pointMap(points: readonly KlinePoint[]): Map<string, KlinePoint> {
  return new Map(points
    .filter((point) => Number.isFinite(point.close) && point.close > 0 && /^\d{4}-\d{2}-\d{2}/.test(point.time))
    .map((point) => [point.time.slice(0, 10), point]))
}

function withPositive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null
}

function getTradingHistory(input: BuildSevereEstimateInput, profile: BoardProfile, date: string) {
  const stocks = pointMap(input.dayPoints)
  const indices = pointMap(input.indexPoints)
  const dates = [...new Set([...stocks.keys(), ...indices.keys(), date])].filter((day) => day <= date).sort()
  const listingDate = input.listingDate
  const listingDays = listingDate && dates.includes(listingDate)
    ? new Set(dates.filter((day) => day >= listingDate).slice(0, profile.ipoNoLimitDays))
    : new Set<string>()
  const history: TradingDay[] = []
  let lastStock: KlinePoint | undefined
  let lastIndex: KlinePoint | undefined
  let restart = true
  let scale = 1
  let unavailable = ''
  for (let i = 0; i < dates.length; i += 1) {
    const day = dates[i]
    const stock = stocks.get(day)
    const index = indices.get(day)
    const today = day === date
    const hasTrade = today
      ? withPositive(input.price) !== null && (input.volume === undefined || input.volume > 0)
      : Boolean(stock && stock.volume > 0)
    const noLimit = listingDays.has(day) || (today && input.hasPriceLimit === false)
    if (history.length && nextTradingDay(dates[i - 1]) < day) restart = true
    if (!hasTrade || !index || noLimit) {
      restart = true
      if (today) unavailable = noLimit ? '无涨跌幅限制' : !hasTrade ? '该日暂无成交' : '缺少同日基准指数'
    } else if (lastStock && lastIndex) {
      const prevClose = today ? withPositive(input.prevClose) : lastStock.close
      if (prevClose !== null) {
        if (today) scale = lastStock.close / prevClose
        history.push({
          date: day, price: today ? input.price * scale : stock!.close, index: index.close,
          baseDate: dates[i - 1], stockBase: lastStock.close, indexBase: lastIndex.close,
          turnoverRate: today ? (withPositive(input.turnoverRate) ?? stock?.turnoverRate) : stock?.turnoverRate,
          restart
        })
        restart = false
      }
    }
    if (stock && stock.volume > 0) lastStock = stock
    lastIndex = index
  }
  return { history, scale, unavailable, indexLastClose: indices.get(date)?.close ?? null }
}

function windowBases(history: readonly TradingDay[], start: number, days: number): TradingDay[] {
  return history.slice(Math.max(start, history.length - days))
}

function deviation(base: WindowBase, current: TradingDay): Deviation {
  const stockReturn = (current.price / base.stockBase - 1) * 100
  const indexReturn = (current.index / base.indexBase - 1) * 100
  return { baseDate: base.baseDate, stockReturn, indexReturn, value: stockReturn - indexReturn }
}

function priceLimit(prevClose: number, ratio: number, direction: Direction): number {
  const sign = direction === 'up' ? 1 : -1
  const rounded = roundTick(prevClose * (1 + sign * ratio))
  return Math.max(0.01, rounded === prevClose ? roundTick(prevClose + sign * 0.01) : rounded)
}

function triggerLine(
  history: readonly TradingDay[],
  start: number,
  days: number,
  threshold: number,
  scale: number,
  limit: number | null
): TriggerLine {
  const line: TriggerLine = {
    threshold, price: null, changePercent: null, baseDate: null, current: null, fullWindow: null,
    limitPrice: limit, reached: false, reachable: false
  }
  const today = history.at(-1)
  if (!today) return line
  const up = threshold > 0
  const sign = up ? 1 : -1
  let critical = up ? Infinity : -Infinity
  const bases = windowBases(history, start, days)
  for (const base of bases) {
    const move = deviation(base, today)
    if (!line.current || sign * move.value > sign * line.current.value) line.current = move
    const rawPrice = base.stockBase / scale * (1 + (threshold + move.indexReturn) / 100)
    if (sign * rawPrice < sign * critical) {
      critical = rawPrice
      line.baseDate = base.baseDate
    }
  }
  if (!line.current) return line
  if (bases.length === days) line.fullWindow = deviation(bases[0], today)
  const cents = critical * 100
  const tick = up ? Math.max(1, Math.ceil(cents - 1e-8)) : Math.floor(cents + 1e-8)
  line.price = tick > 0 ? tick / 100 : null
  line.changePercent = line.price === null ? null : (line.price / (today.stockBase / scale) - 1) * 100
  line.reached = sign * (line.current.value - threshold) >= -1e-8
  line.reachable = line.price !== null && limit !== null && sign * (limit - line.price) >= 0
  return line
}

function getTurnover(history: readonly TradingDay[], ordinaryStart: number) {
  const rates = history.slice(-8).map((day) => day.turnoverRate)
  if (history.length - ordinaryStart < 3 || rates.length < 8 || rates.some((rate) => rate == null)) return null
  const sum = (values: (number | undefined)[]) => values.reduce<number>((total, value) => total + (value ?? 0), 0)
  const cumulative = sum(rates.slice(5))
  const previousAverage = sum(rates.slice(0, 5)) / 5
  const ratio = previousAverage > 0 ? cumulative / 3 / previousAverage : null
  return { cumulative, ratio, triggered: ratio !== null && ratio >= 30 - 1e-8 && cumulative >= 20 - 1e-8 }
}

interface WindowState {
  ordinaryStart: number
  severeStart: number
  events: { index: number; direction: Direction }[]
}

function advanceWindow(state: WindowState, index: number, reset?: 'ordinary' | 'severe') {
  if (reset) state.ordinaryStart = index
  if (reset === 'severe') state.severeStart = index
  state.events = reset === 'severe' ? [] : state.events.filter((event) => event.index > index - 10)
}

function evaluateOrdinary(history: readonly TradingDay[], state: WindowState, profile: BoardProfile) {
  const up = triggerLine(history, state.ordinaryStart, 3, profile.abnormal3dThreshold, 1, null)
  const down = triggerLine(history, state.ordinaryStart, 3, -profile.abnormal3dThreshold, 1, null)
  const direction: Direction | null = up.reached && (!down.reached || up.current!.value >= -down.current!.value)
    ? 'up' : down.reached ? 'down' : null
  const turnover = profile.turnoverRule ? getTurnover(history, state.ordinaryStart) : null
  return { up, down, direction, turnover }
}

function commitOrdinary(state: WindowState, index: number, ordinary: ReturnType<typeof evaluateOrdinary>) {
  if (ordinary.direction || ordinary.turnover?.triggered) state.ordinaryStart = index + 1
  if (ordinary.direction) {
    if (state.events.at(-1)?.direction !== ordinary.direction) state.events = []
    state.events.push({ index, direction: ordinary.direction })
  }
}

function severeLines(
  history: readonly TradingDay[], start: number, profile: BoardProfile,
  direction: Direction, scale: number, limit: number | null
) {
  return profile.severeRules.map((rule) => triggerLine(history, start, rule.days, rule[direction], scale, limit))
}

export function buildSevereEstimate(input: BuildSevereEstimateInput) {
  const calendarToday = input.todayYmd ?? getShanghaiClock().ymd
  const quoteDate = quoteTradeDate(input.quoteTime)
  const date = quoteDate && quoteDate <= calendarToday ? quoteDate : calendarToday
  const profile = boardProfile(input.code, input.name, date)
  const { history, scale, unavailable, indexLastClose } = getTradingHistory(input, profile, date)
  const days = Math.max(1, Math.min(input.days ?? 10, 30))
  const quoted = history.at(-1)?.date === date
  const state: WindowState = { ordinaryStart: 0, severeStart: 0, events: [] }
  for (let i = 0; i < history.length; i += 1) {
    const bar = history[i]
    // 公司公告一般在交易所公布后的次一交易日开市前披露，周末公告归到下一交易日。
    const notices = input.announcements?.filter((notice) => notice.date > bar.baseDate && notice.date <= bar.date)
    const severeNotice = notices?.some((notice) => /严重异常波动.*公告/.test(notice.title))
    const ordinaryNotice = notices?.some((notice) => /交易(?:价格)?异常波动.*公告/.test(notice.title))
    advanceWindow(state, i, bar.restart || severeNotice ? 'severe' : ordinaryNotice ? 'ordinary' : undefined)
    if (quoted && i === history.length - 1) break
    const past = history.slice(0, i + 1)
    const historicalProfile = boardProfile(input.code, input.name, bar.date)
    commitOrdinary(state, i, evaluateOrdinary(past, state, historicalProfile))
    if (bar.date >= RULE_CHANGE && (state.events.length >= profile.sameDirectionLimit
      || DIRECTIONS.some((direction) => severeLines(past, state.severeStart, profile, direction, 1, null).some((line) => line.reached)))) {
      advanceWindow(state, i + 1, 'severe')
    }
  }

  const current = quoted ? history : []
  const referenceClose = withPositive(input.prevClose)
  const limit = (direction: Direction) => {
    if (!quoted || referenceClose === null) return null
    const explicit = direction === 'up' ? input.limitUp : input.limitDown
    return withPositive(explicit) ?? priceLimit(referenceClose, profile.limitRatio, direction)
  }
  const row: SevereRow = {
    date,
    up: severeLines(current, state.severeStart, profile, 'up', scale, limit('up')),
    down: severeLines(current, state.severeStart, profile, 'down', scale, limit('down'))
  }
  const ordinary = evaluateOrdinary(current, state, profile)
  const afterToday: WindowState = { ...state, events: [...state.events] }
  if (quoted) commitOrdinary(afterToday, history.length - 1, ordinary)
  const sameDirection = {
    up: afterToday.events.filter((event) => event.direction === 'up').length,
    down: afterToday.events.filter((event) => event.direction === 'down').length,
    limit: profile.sameDirectionLimit,
    projected: { up: null, down: null } as Record<Direction, number | null>
  }
  const triggered = quoted && (sameDirection.up >= sameDirection.limit || sameDirection.down >= sameDirection.limit
    || DIRECTIONS.some((direction) => row[direction].some((line) => line.reached)))

  const rows = [row]
  while (rows.length <= days) rows.push({ date: nextTradingDay(rows.at(-1)!.date), up: [], down: [] })
  for (const direction of DIRECTIONS) {
    for (const rule of profile.severeRules) {
      const path = [...current]
      let previous = input.price
      for (const future of rows.slice(1)) {
        const cap = quoted ? priceLimit(previous, profile.limitRatio, direction) : null
        if (cap !== null) path.push({
          date: future.date, price: cap * scale, index: indexLastClose!, indexBase: indexLastClose!,
          baseDate: path.at(-1)!.date, stockBase: previous * scale, restart: false
        })
        const line = triggerLine(path, afterToday.severeStart, rule.days, rule[direction], scale, cap)
        future[direction].push(line)
        if (cap !== null) {
          const opposite = priceLimit(previous, profile.limitRatio, direction === 'up' ? 'down' : 'up')
          const safe = line.reachable && line.price !== null
            ? roundTick(line.price + (direction === 'up' ? -0.01 : 0.01))
            : cap
          previous = direction === 'up' ? Math.max(safe, opposite) : Math.min(safe, opposite)
          path.at(-1)!.price = previous * scale
        }
      }
    }

    if (!quoted || triggered) continue
    const path = [...current]
    const projected: WindowState = { ...afterToday, events: [...afterToday.events] }
    for (const [offset, future] of rows.slice(1).entries()) {
      const previous = path.at(-1)!
      const close = priceLimit(roundTick(previous.price / scale), profile.limitRatio, direction) * scale
      path.push({
        date: future.date, price: close, index: previous.index, indexBase: previous.index,
        baseDate: previous.date, stockBase: previous.price, restart: false
      })
      const index = path.length - 1
      advanceWindow(projected, index)
      commitOrdinary(projected, index, evaluateOrdinary(path, projected, profile))
      if (projected.events.length >= profile.sameDirectionLimit && projected.events.at(-1)?.direction === direction) {
        sameDirection.projected[direction] = offset + 1
        break
      }
    }
  }

  const previousIndex = quoted ? current.at(-1)!.indexBase : null
  return {
    profile, indexLastClose, indexChange: previousIndex && indexLastClose ? (indexLastClose / previousIndex - 1) * 100 : null,
    today: { ...row, triggered, unavailable: quoted ? '' : unavailable || '日线数据不足' },
    ordinary, sameDirection, rows
  }
}
