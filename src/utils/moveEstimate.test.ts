import { describe, expect, it } from 'vitest'
import {
  buildMoveEstimate,
  inferBoardKind,
  limitRatioForBoard,
  nextTradingDay,
  roundTick,
  weekdayOf
} from './moveEstimate'
import type { KlinePoint } from '../api/stock'

function kline(date: string, close: number): KlinePoint {
  return { time: date, open: close, close, high: close, low: close, volume: 1000 }
}

describe('moveEstimate limit ladder', () => {
  it('chains limit-up prices like the reference table', () => {
    const estimate = buildMoveEstimate({
      code: '002086',
      name: '东方海洋',
      price: 4.61,
      changePercent: -4.36,
      prevClose: 4.82,
      dayPoints: [],
      todayYmd: '2026-11-16'
    })

    expect(estimate.boardKind).toBe('main')
    expect(estimate.limitPercent).toBe(10)
    expect(estimate.future.map((row) => row.date)).toEqual([
      '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23'
    ])
    expect(estimate.future.map((row) => row.weekday)).toEqual(['周二', '周三', '周四', '周五', '周一'])
    expect(estimate.future.map((row) => row.limitUpPrice)).toEqual([5.07, 5.58, 6.14, 6.75, 7.43])
    expect(estimate.future.map((row) => Number(row.limitUpPercent?.toFixed(2)))).toEqual([
      9.98, 10.06, 10.04, 9.93, 10.07
    ])
    // 跌停价按每个交易日的模拟昨收（前一日涨停价）计算
    expect(estimate.future.map((row) => row.limitDownPrice)).toEqual([4.15, 4.56, 5.02, 5.53, 6.08])
    expect(estimate.today?.price).toBe(4.61)
    expect(estimate.today?.changePercent).toBe(-4.36)
  })

  it('uses the board and ST limit ratios', () => {
    expect(inferBoardKind('300750')).toBe('chinext')
    expect(inferBoardKind('688981')).toBe('star')
    expect(inferBoardKind('830799')).toBe('bse')
    expect(inferBoardKind('sh600000')).toBe('main')
    expect(limitRatioForBoard('main', true)).toBe(0.05)
    expect(limitRatioForBoard('chinext', true)).toBe(0.2)
    expect(limitRatioForBoard('chinext', false)).toBe(0.2)

    const st = buildMoveEstimate({
      code: '600000',
      name: 'ST九有',
      price: 10,
      changePercent: 0,
      prevClose: 10,
      dayPoints: [],
      todayYmd: '2026-11-16'
    })
    expect(st.limitPercent).toBe(5)
    expect(st.future[0].limitUpPrice).toBe(10.5)
    expect(st.future[0].limitDownPrice).toBe(9.5)
  })
})

describe('moveEstimate past week', () => {
  it('derives real change percentages from daily closes', () => {
    const estimate = buildMoveEstimate({
      code: '600000',
      name: '浦发银行',
      price: 4.61,
      changePercent: 1.32,
      prevClose: 4.55,
      dayPoints: [
        kline('2026-11-09', 4.4),
        kline('2026-11-10', 4.5),
        kline('2026-11-11', 4.6),
        kline('2026-11-12', 4.55),
        kline('2026-11-13', 4.61),
        kline('2026-11-16', 4.65)
      ],
      todayYmd: '2026-11-16'
    })

    expect(estimate.past.map((row) => row.date)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'
    ])
    expect(estimate.past[0].changePercent).toBeNull()
    expect(Number(estimate.past[1].changePercent?.toFixed(2))).toBe(2.27)
    expect(Number(estimate.past[4].changePercent?.toFixed(2))).toBe(1.32)
    expect(estimate.past[4].basePrice).toBe(4.55)
    expect(estimate.past.every((row) => row.kind === 'past')).toBe(true)
  })
})

describe('moveEstimate calendar helpers', () => {
  it('skips weekends when advancing trading days', () => {
    expect(nextTradingDay('2026-11-16')).toBe('2026-11-17')
    expect(nextTradingDay('2026-11-20')).toBe('2026-11-23')
    expect(weekdayOf('2026-11-23')).toBe('周一')
    expect(weekdayOf('not-a-date')).toBe('')
  })

  it('rounds limit prices to the 0.01 tick', () => {
    expect(roundTick(5.071)).toBe(5.07)
    expect(roundTick(5.577)).toBe(5.58)
    expect(roundTick(7.425)).toBe(7.43)
  })
})
