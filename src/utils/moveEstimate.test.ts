import { describe, expect, it } from 'vitest'
import { boardProfile, buildSevereEstimate, nextTradingDay, quoteTradeDate, roundTick } from './moveEstimate'
import type { KlinePoint } from '../api/stock'

function kline(time: string, close: number, turnoverRate = 1): KlinePoint {
  return { time, open: close, close, high: close, low: close, volume: 1000, turnoverRate }
}

function fixture(count = 40) {
  let date = '2026-08-03'
  const dates = Array.from({ length: count }, (_, i) => i ? (date = nextTradingDay(date)) : date)
  return {
    code: '002579', name: '中京电子', price: 10, prevClose: 10, todayYmd: date,
    dayPoints: dates.map((day) => kline(day, 10)),
    indexPoints: dates.map((day) => kline(day, 1000))
  }
}

describe('2026 年交易规则', () => {
  it('selects the benchmarks and board thresholds', () => {
    expect(boardProfile('600000', '浦发银行').indexCode).toBe('sh000002')
    expect(boardProfile('000001', '平安银行').indexCode).toBe('sz399107')
    expect(boardProfile('300750', '宁德时代')).toMatchObject({
      indexCode: 'sz399102', abnormal3dThreshold: 30, limitRatio: 0.2, sameDirectionLimit: 3, turnoverRule: false
    })
    expect(boardProfile('688981', '中芯国际').indexCode).toBe('sh000688')
    expect(boardProfile('920799', '艾融软件')).toMatchObject({
      indexCode: 'bj899050', abnormal3dThreshold: 40, limitRatio: 0.3, sameDirectionLimit: 3, ipoNoLimitDays: 1,
      severeRules: [{ days: 10, up: 150, down: -60 }, { days: 30, up: 300, down: -75 }]
    })
  })

  it('applies the main-board ST change from July 6 onward', () => {
    expect(boardProfile('600000', '*ST样例', '2026-07-03')).toMatchObject({ limitRatio: 0.05, abnormal3dThreshold: 12 })
    expect(boardProfile('000001', '*ST样例', '2026-07-06')).toMatchObject({ limitRatio: 0.1, abnormal3dThreshold: 20 })
    expect(boardProfile('300750', '*ST样例')).toMatchObject({ limitRatio: 0.2, abnormal3dThreshold: 30 })
  })
})

describe('异动测算', () => {
  it('shows the strongest shorter window alongside the full window and uses interval returns', () => {
    const input = fixture()
    const n = input.dayPoints.length
    input.dayPoints[n - 8].close = 10.9
    for (let i = n - 7; i < n; i++) input.dayPoints[i].close = 12 + (i - (n - 7)) * 1.206
    for (let i = 0; i < n - 8; i++) input.dayPoints[i].close = 11.64
    input.dayPoints[n - 2].close = 19.23
    input.indexPoints[n - 8].close = 2000
    for (let i = 0; i < n - 8; i++) input.indexPoints[i].close = 2068.19
    for (let i = n - 7; i < n; i++) input.indexPoints[i].close = 1892.6
    const estimate = buildSevereEstimate({ ...input, price: 20.36, prevClose: 19.23, limitUp: 21.15 })
    const [short, long] = estimate.today.up
    expect(short.current?.value).toBeCloseTo(92.16)
    expect(short.current?.baseDate).toBe(input.dayPoints[n - 8].time)
    expect(short.fullWindow?.value).toBeCloseTo(83.40)
    expect(short).toMatchObject({ price: 21.22, limitPrice: 21.15, reached: false, reachable: false })
    expect(long.price).toBe(32.12)
  })

  it('rounds up for positive thresholds and down for negative thresholds', () => {
    const input = fixture()
    input.indexPoints.at(-1)!.close = 1000.4
    const estimate = buildSevereEstimate(input)
    expect(estimate.rows[0].up[0].price).toBe(20.01)
    expect(estimate.rows[0].down[0].price).toBe(5)
    expect(estimate.rows[0].down[1].price).toBe(3)
    expect(estimate.today.triggered).toBe(false)
  })

  it('rolls the next projected session from a tradable price one tick below the upper trigger', () => {
    const estimate = buildSevereEstimate(fixture())
    const row = estimate.rows.findIndex((row) => row.up[0].reachable)
    expect(row).toBe(8)
    expect(estimate.rows[row].up[0].price).toBe(20)
    expect(estimate.rows[row + 1].up[0].limitPrice).toBe(21.99)
    expect(estimate.rows[row + 1].up[1].reachable).toBe(false)
  })

  it('detects ordinary abnormal moves inside three sessions and avoids overlapping events', () => {
    const input = fixture()
    input.dayPoints.at(-3)!.close = 11
    input.dayPoints.at(-2)!.close = 12.1
    const first = buildSevereEstimate({ ...input, price: 12.1, prevClose: 12.1 })
    expect(first.ordinary.direction).toBeNull()
    expect(first.sameDirection.up).toBe(1)
    expect(buildSevereEstimate(fixture()).sameDirection.projected.up).toBe(8)
    expect(buildSevereEstimate({ ...fixture(), code: '300750' }).sameDirection.projected.up).toBe(6)
  })

  it('breaks a same-direction streak when an opposite ordinary event occurs', () => {
    const input = fixture()
    input.dayPoints.at(-5)!.close = 11
    input.dayPoints.at(-4)!.close = 12.1
    input.dayPoints.at(-3)!.close = 10.89
    input.dayPoints.at(-2)!.close = 9.8
    const estimate = buildSevereEstimate({ ...input, price: 8.82, prevClose: 9.8 })
    expect(estimate.ordinary.direction).toBe('down')
    expect(estimate.sameDirection).toMatchObject({ up: 0, down: 1 })
  })

  it('requires both turnover conditions and keeps turnover out of the same-direction count', () => {
    const input = fixture()
    input.dayPoints.slice(-8, -3).forEach((point) => { point.turnoverRate = 0.2 })
    input.dayPoints.slice(-3).forEach((point) => { point.turnoverRate = 7 })
    const estimate = buildSevereEstimate(input)
    expect(estimate.ordinary.turnover).toEqual({ cumulative: 21, ratio: 35, triggered: true })
    expect(estimate.sameDirection).toMatchObject({ up: 0, down: 0 })
    expect(buildSevereEstimate({ ...input, turnoverRate: 5 }).ordinary.turnover?.triggered).toBe(false)
    expect(buildSevereEstimate({ ...input, code: '300750' }).ordinary.turnover).toBeNull()
  })

  it('restarts on the next session after a severe notice or on full-day suspension resumption', () => {
    const input = fixture()
    input.dayPoints.at(-2)!.close = 15
    const before = buildSevereEstimate({ ...input, price: 15, prevClose: 15 })
    expect(before.today.up[0].current?.value).toBeCloseTo(50)
    const announced = buildSevereEstimate({
      ...input, price: 15, prevClose: 15, announcements: [
        { title: '股票交易严重异常波动公告', date: input.todayYmd, category: '', url: '' }
      ]
    })
    expect(announced.today.up[0].current?.value).toBeCloseTo(0)
    expect(announced.sameDirection).toMatchObject({ up: 0, down: 0 })
    input.dayPoints.splice(-2, 1)
    const resumed = buildSevereEstimate(input)
    expect(resumed.today.up[0].fullWindow).toBeNull()
    expect(resumed.today.up[0].current?.value).toBeCloseTo(0)
  })

  it('excludes initial no-limit sessions and uses the last excluded close as the next baseline', () => {
    const input = fixture(5)
    const listingDate = input.dayPoints[0].time
    const excluded = buildSevereEstimate({ ...input, listingDate })
    expect(excluded.today.unavailable).toBe('无涨跌幅限制')
    expect(excluded.today.up[0].price).toBeNull()
    expect(buildSevereEstimate({ ...input, listingDate, code: '920799' }).today.up[0].price).toBe(25)
    expect(buildSevereEstimate({ ...fixture(6), listingDate }).today.up[0]).toMatchObject({
      fullWindow: null, current: { baseDate: input.todayYmd }
    })
  })

  it('does not substitute an old index quote or calculate a no-trade day', () => {
    const input = fixture()
    expect(buildSevereEstimate({ ...input, volume: 0 }).today.unavailable).toBe('该日暂无成交')
    input.indexPoints.pop()
    const estimate = buildSevereEstimate(input)
    expect(estimate.today.unavailable).toBe('缺少同日基准指数')
    expect(estimate.rows[1].up[0].price).toBeNull()
  })
})

describe('交易日与最小报价单位', () => {
  it('skips weekends and announced holidays', () => {
    expect(nextTradingDay('2026-11-27')).toBe('2026-11-30')
    expect(nextTradingDay('2026-09-30')).toBe('2026-10-08')
    expect(nextTradingDay('2026-12-31')).toBe('2027-01-04')
  })

  it('validates the quote date and rounds limit prices half-up', () => {
    expect(quoteTradeDate('20261116145000')).toBe('2026-11-16')
    expect(quoteTradeDate('20260231145000')).toBeNull()
    expect(roundTick(4.565)).toBe(4.57)
    expect(roundTick(19.995)).toBe(20)
  })
})
