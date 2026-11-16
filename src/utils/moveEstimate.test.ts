import { describe, expect, it } from 'vitest'
import {
  abnormalThresholdPercent,
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

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    code: '002242',
    name: '九阳股份',
    price: 12.71,
    changePercent: 10.04,
    prevClose: 11.55,
    dayPoints: [
      kline('2026-11-10', 10),
      kline('2026-11-11', 10.5),
      kline('2026-11-12', 11),
      kline('2026-11-13', 11.55)
    ],
    todayYmd: '2026-11-16',
    ...overrides
  }
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
    expect(estimate.abnormalThresholdPercent).toBe(20)
    expect(estimate.future.map((row) => row.date)).toEqual([
      '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-23'
    ])
    expect(estimate.future.map((row) => row.weekday)).toEqual(['周二', '周三', '周四', '周五', '周一'])
    expect(estimate.future.map((row) => row.limitUpPrice)).toEqual([5.07, 5.58, 6.14, 6.75, 7.43])
    expect(estimate.future.map((row) => Number(row.limitUpPercent?.toFixed(2)))).toEqual([
      9.98, 10.06, 10.04, 9.93, 10.07
    ])
    expect(estimate.future.map((row) => row.limitDownPrice)).toEqual([4.15, 4.56, 5.02, 5.53, 6.08])
    expect(estimate.today?.price).toBe(4.61)
  })

  it('uses board and ST rules for both limit and abnormal thresholds', () => {
    expect(inferBoardKind('300750')).toBe('chinext')
    expect(inferBoardKind('688981')).toBe('star')
    expect(inferBoardKind('830799')).toBe('bse')
    expect(inferBoardKind('sh600000')).toBe('main')
    expect(limitRatioForBoard('main', true)).toBe(0.05)
    expect(limitRatioForBoard('chinext', true)).toBe(0.2)
    expect(abnormalThresholdPercent('main', false)).toBe(20)
    expect(abnormalThresholdPercent('main', true)).toBe(15)
    expect(abnormalThresholdPercent('chinext', true)).toBe(30)
    expect(abnormalThresholdPercent('bse', false)).toBe(30)

    const st = buildMoveEstimate({
      code: '600000',
      name: 'ST九有',
      price: 10,
      changePercent: 0,
      prevClose: 10,
      dayPoints: [kline('2026-11-10', 10), kline('2026-11-11', 10), kline('2026-11-12', 10), kline('2026-11-13', 10)],
      todayYmd: '2026-11-16'
    })
    expect(st.limitPercent).toBe(5)
    expect(st.abnormalThresholdPercent).toBe(15)
    expect(st.future[0].limitUpPrice).toBe(10.5)
  })
})

describe('moveEstimate abnormal fluctuation rule', () => {
  it('flags the current 3-day run once it exceeds the threshold', () => {
    const estimate = buildMoveEstimate(baseInput())

    // 10.5 → 12.71 三个交易日累计 +21.05%，已经触发主板 20% 异动
    expect(Number(estimate.currentCumulative3d?.toFixed(2))).toBe(21.05)
    expect(estimate.currentAbnormalPrice).toBe(12.6)
    expect(estimate.today?.abnormalStatus).toBe('already')
  })

  it('compares the abnormal trigger price with the limit-up price each day', () => {
    const estimate = buildMoveEstimate(baseInput())

    // 明天：3 日窗口基准 11.00，异动价 13.20；涨停 13.98 > 13.20 → 涨停就会触发
    const first = estimate.future[0]
    expect(first.abnormalPrice).toBe(13.2)
    expect(Number(first.abnormalPercent?.toFixed(2))).toBe(3.86)
    expect(first.limitUpPrice).toBe(13.98)
    expect(first.abnormalStatus).toBe('reachable')
    expect(estimate.daysToAbnormal).toBe(1)
  })

  it('reports days needed when a limit-up alone does not trigger abnormal', () => {
    const flat = buildMoveEstimate({
      code: '002242',
      name: '九阳股份',
      price: 10,
      changePercent: 0,
      prevClose: 10,
      dayPoints: [
        kline('2026-11-10', 10),
        kline('2026-11-11', 10),
        kline('2026-11-12', 10),
        kline('2026-11-13', 10)
      ],
      todayYmd: '2026-11-16'
    })

    // 第一天涨停 11.00 < 异动价 12.00（不触发），第二天涨停 12.10 ≥ 12.00（触发）
    expect(flat.future[0].abnormalStatus).toBe('unreachable')
    expect(flat.future[1].abnormalStatus).toBe('reachable')
    expect(flat.daysToAbnormal).toBe(2)
  })

  it('uses 30% for ChiNext and 15% for ST main-board names', () => {
    const chinext = buildMoveEstimate({
      code: '300750',
      name: '*ST宁德',
      price: 10,
      changePercent: 0,
      prevClose: 10,
      dayPoints: [kline('2026-11-12', 10), kline('2026-11-13', 10)],
      todayYmd: '2026-11-16'
    })
    expect(chinext.abnormalThresholdPercent).toBe(30)
    expect(chinext.limitPercent).toBe(20)

    const st = buildMoveEstimate({
      code: '600000',
      name: 'ST九有',
      price: 10,
      changePercent: 0,
      prevClose: 10,
      dayPoints: [
        kline('2026-11-10', 10),
        kline('2026-11-11', 10),
        kline('2026-11-12', 10),
        kline('2026-11-13', 10)
      ],
      todayYmd: '2026-11-16'
    })
    // ST 主板：异动 15%，第一天涨停 10.5 < 11.5 不触发，第三天涨停 ~11.58 ≥ 11.50 触发
    expect(st.abnormalThresholdPercent).toBe(15)
    expect(st.future[0].abnormalStatus).toBe('unreachable')
    expect(st.daysToAbnormal).toBe(3)
  })
})

describe('moveEstimate past week', () => {
  it('derives real change percentages from daily closes', () => {
    const estimate = buildMoveEstimate({
      ...baseInput(),
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
      ]
    })

    expect(estimate.past.map((row) => row.date)).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'
    ])
    expect(estimate.past[0].changePercent).toBeNull()
    expect(Number(estimate.past[1].changePercent?.toFixed(2))).toBe(2.27)
    expect(Number(estimate.past[4].changePercent?.toFixed(2))).toBe(1.32)
    expect(estimate.past[4].basePrice).toBe(4.55)
  })
})

describe('moveEstimate calendar helpers', () => {
  it('skips weekends when advancing trading days', () => {
    expect(nextTradingDay('2026-11-16')).toBe('2026-11-17')
    expect(nextTradingDay('2026-11-20')).toBe('2026-11-23')
    expect(weekdayOf('2026-11-23')).toBe('周一')
    expect(weekdayOf('not-a-date')).toBe('')
  })

  it('rounds limit prices to the 0.01 tick with exchange half-up rules', () => {
    expect(roundTick(5.071)).toBe(5.07)
    expect(roundTick(5.577)).toBe(5.58)
    expect(roundTick(7.425)).toBe(7.43)
    // 4.15 × 1.1 = 4.565，交易所四舍五入到 4.57，不能因浮点误差变成 4.56
    expect(roundTick(4.15 * 1.1)).toBe(4.57)
    expect(roundTick(4.15 * 0.9)).toBe(3.74)
  })

  it('falls back to the quote trading date on weekends or pre-open', () => {
    const estimate = buildMoveEstimate({
      code: '600000',
      name: '浦发银行',
      price: 10,
      changePercent: 0,
      prevClose: 9.9,
      dayPoints: [],
      quoteTime: '20261113150000',
      todayYmd: '2026-11-15'
    })

    expect(estimate.referenceDate).toBe('2026-11-13')
    expect(estimate.today?.date).toBe('2026-11-13')
    expect(estimate.future[0].date).toBe('2026-11-16')
  })
})
