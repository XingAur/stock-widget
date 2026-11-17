import { describe, expect, it } from 'vitest'
import {
  buildSevereEstimate,
  boardProfile,
  nextTradingDay,
  quoteTradeDate,
  roundTick,
  weekdayOf
} from './moveEstimate'
import type { KlinePoint } from '../api/stock'

function kline(date: string, close: number): KlinePoint {
  return { time: date, open: close, close, high: close, low: close, volume: 1000 }
}

function weekdaysBack(endDate: string, count: number): string[] {
  const dates: string[] = []
  const cursor = new Date(endDate + 'T00:00:00')
  while (dates.length < count) {
    const day = cursor.getDay()
    if (day !== 0 && day !== 6) {
      dates.unshift([
        cursor.getFullYear(),
        String(cursor.getMonth() + 1).padStart(2, '0'),
        String(cursor.getDate()).padStart(2, '0')
      ].join('-'))
    }
    cursor.setDate(cursor.getDate() - 1)
  }
  return dates
}

function buildSeries(endDate: string, count: number, close: (index: number) => number) {
  const dates = weekdaysBack(endDate, count)
  return dates.map((date, index) => kline(date, close(index)))
}

describe('boardProfile', () => {
  it('maps boards to official benchmark indices', () => {
    expect(boardProfile('600715', '文投控股')).toMatchObject({ kind: 'sh-main', indexCode: 'sh000002', indexName: '上证A指', limitRatio: 0.1, sameDirectionLimit: 4 })
    expect(boardProfile('000001', '平安银行')).toMatchObject({ kind: 'sz-main', indexCode: 'sz399107', indexName: '深证A指' })
    expect(boardProfile('300750', '宁德时代')).toMatchObject({ kind: 'chinext', indexCode: 'sz399102', limitRatio: 0.2, sameDirectionLimit: 3 })
    expect(boardProfile('688981', '中芯国际')).toMatchObject({ kind: 'star', indexCode: 'sh000688', indexName: '科创50' })
    expect(boardProfile('830799', '艾融软件')).toMatchObject({ kind: 'bse', indexCode: 'bj899050', limitRatio: 0.3 })
  })

  it('tightens limit and 3-day threshold for ST main-board names', () => {
    expect(boardProfile('600000', 'ST九有')).toMatchObject({ limitRatio: 0.05, abnormal3dThreshold: 12 })
    expect(boardProfile('300750', '*ST宁德')).toMatchObject({ limitRatio: 0.2, abnormal3dThreshold: 30 })
  })
})

describe('severe abnormal fluctuation rule', () => {
  const endDate = '2026-11-16'

  it('computes the critical price with the index subtracted', () => {
    // 个股横盘 10 元、指数从 1000 跌到 950（-5%），100% 规则的临界价 = 10 × (1 + 100% - 5%) = 19.5
    const stock = buildSeries(endDate, 40, () => 10)
    const index = buildSeries(endDate, 40, () => 1000)
    index[index.length - 1] = kline(index.at(-1)!.time, 950)
    const estimate = buildSevereEstimate({
      code: '600715', name: '文投控股', price: 18, prevClose: 18,
      dayPoints: stock, indexPoints: index, todayYmd: endDate
    })
    expect(estimate.indexReady).toBe(true)
    // 第一个交易日：基准取 9 个交易日前的 1000 点，未来指数按 950 点不变，
    // 100% 临界价 = 10 × (1 + 100% - 5%) = 19.5；涨停价 19.8 ≥ 19.5 → 触发
    expect(estimate.rows[0].cells[0]).toMatchObject({ kind: 'trigger', price: 19.5 })
    expect(estimate.rows[0].cells[0].percent).toBeCloseTo((19.5 / 18 - 1) * 100, 5)
  })

  it('keeps limit-up simulation while the critical price is far away', () => {
    const stock = buildSeries(endDate, 40, () => 10)
    const index = buildSeries(endDate, 40, () => 1000)
    const estimate = buildSevereEstimate({
      code: '600715', name: '文投控股', price: 10, prevClose: 10,
      dayPoints: stock, indexPoints: index, todayYmd: endDate
    })

    // 第一个交易日：涨停 11.00，远低于 100% 临界价 20 → 涨停不触发
    expect(estimate.rows[0].cells[0]).toMatchObject({ kind: 'limit', price: 11, badge: '涨停不触发' })
    expect(estimate.rows[0].cells[0].percent).toBeCloseTo(10, 5)
    // 今日收盘 10 元，今日涨停 11 元不触发严重异动
    expect(estimate.today.badges[0]).toBe('今日涨停不触发100%规则')
    expect(estimate.today.triggered).toBe(false)
  })

  it('caps the simulated close at the highest non-trigger price', () => {
    const stock = buildSeries(endDate, 40, () => 10)
    const index = buildSeries(endDate, 40, () => 1000)
    const estimate = buildSevereEstimate({
      code: '600715', name: '文投控股', price: 10.9, prevClose: 10,
      dayPoints: stock, indexPoints: index, todayYmd: endDate
    })
    const triggerRow = estimate.rows.find((row) => row.cells[0].kind === 'trigger')!
    expect(triggerRow.cells[0].price).toBe(20)
    // 触发日的模拟收盘 = 触发价 - 0.01，用于次日推演
    const nextRow = estimate.rows[estimate.rows.indexOf(triggerRow) + 1]
    expect(nextRow.cells[0].prevClose).toBe(19.99)
    expect(triggerRow.cells[0].badge).toBe('达到即触发')
  })

  it('flags 200% rule later than the 100% rule', () => {
    const stock = buildSeries(endDate, 60, () => 10)
    const index = buildSeries(endDate, 60, () => 1000)
    const estimate = buildSevereEstimate({
      code: '600715', name: '文投控股', price: 10, prevClose: 10,
      dayPoints: stock, indexPoints: index, todayYmd: endDate, days: 25
    })
    const first100 = estimate.rows.findIndex((row) => row.cells[0].kind === 'trigger')
    const first200 = estimate.rows.findIndex((row) => row.cells[1].kind === 'trigger')
    expect(first100).toBeGreaterThanOrEqual(0)
    expect(first200).toBeGreaterThan(first100)
  })

it('counts same-direction abnormal events in the last 10 trading days', () => {
    // 连续涨停路径下，3 日累计偏离会不断触发 20% 同向异常波动；主板 10 日内 4 次即达上限
    const stock = buildSeries(endDate, 40, () => 10)
    const index = buildSeries(endDate, 40, () => 1000)
    const estimate = buildSevereEstimate({
      code: '600715', name: '文投控股', price: 10, prevClose: 10,
      dayPoints: stock, indexPoints: index, todayYmd: endDate, days: 10
    })
    expect(estimate.sameDirection.limit).toBe(4)
    expect(estimate.sameDirection.up).toBe(0)
    // 连续涨停推演：第 5 个交易日累计 4 次同向异动，达到主板上限
    expect(estimate.sameDirection.projectedTriggerDay).toBe(5)
    expect(estimate.rows.filter((row) => row.sameDirectionEvent === 'up').length).toBe(1)
  })

  it('uses 3 times for ChiNext same-direction limit', () => {
    const stock = buildSeries(endDate, 40, () => 10)
    const index = buildSeries(endDate, 40, () => 1000)
    const estimate = buildSevereEstimate({
      code: '300750', name: '宁德时代', price: 10, prevClose: 10,
      dayPoints: stock, indexPoints: index, todayYmd: endDate, days: 10
    })
    expect(estimate.sameDirection.limit).toBe(3)
    expect(estimate.sameDirection.projectedTriggerDay).toBe(4)
  })

  it('reports unknown cells when history is too short', () => {
    const stock = [kline('2026-11-16', 10)]
    const index = [kline('2026-11-16', 1000)]
    const estimate = buildSevereEstimate({
      code: '600715', name: '文投控股', price: 10, prevClose: 10,
      dayPoints: stock, indexPoints: index, todayYmd: endDate
    })
    expect(estimate.rows[0].cells[0].kind).toBe('unknown')
    expect(estimate.rows[0].cells[0].badge).toBe('数据不足')
  })
})

describe('calendar helpers', () => {
  it('skips weekends', () => {
    expect(nextTradingDay('2026-11-16')).toBe('2026-11-17')
    expect(nextTradingDay('2026-11-20')).toBe('2026-11-23')
    expect(weekdayOf('2026-11-23')).toBe('周一')
  })

  it('parses quote time', () => {
    expect(quoteTradeDate('20261116145000')).toBe('2026-11-16')
    expect(quoteTradeDate('bad')).toBeNull()
  })

  it('rounds to the 0.01 tick half-up', () => {
    expect(roundTick(4.565)).toBe(4.57)
    expect(roundTick(19.995)).toBe(20)
  })
})
