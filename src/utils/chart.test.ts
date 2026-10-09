import { describe, expect, it } from 'vitest'
import {
  aggregateKlines,
  createMinuteChartGeometry,
  createMovingAverage,
  createSparklinePoints,
  createReferenceSparkline,
  getRobustVolumeCeiling,
  getPeriodBucket,
  getRange
} from './chart'

const points = [
  { time: '2026-01-02', open: 10, close: 11, high: 12, low: 9, volume: 100 },
  { time: '2026-01-03', open: 11, close: 13, high: 14, low: 10, volume: 200 },
  { time: '2026-04-01', open: 13, close: 12, high: 15, low: 11, volume: 300 }
]

describe('chart helpers', () => {
  it('aggregates kline points by month and quarter', () => {
    expect(aggregateKlines(points, 'month')).toEqual([
      { time: '2026-01-03', open: 10, close: 13, high: 14, low: 9, volume: 300 },
      { time: '2026-04-01', open: 13, close: 12, high: 15, low: 11, volume: 300 }
    ])
    expect(getPeriodBucket('2026-04-01', 'quarter')).toBe('2026-Q2')
  })

  it('creates moving averages with NaN until enough points exist', () => {
    const values = createMovingAverage([1, 2, 3, 4], 3)
    expect(Number.isNaN(values[0])).toBe(true)
    expect(values[2]).toBe(2)
    expect(values[3]).toBe(3)
  })

  it('expands flat ranges and creates sparkline points', () => {
    expect(getRange([5, 5])).toEqual([4.9, 5.1])
    expect(createSparklinePoints([1, 2, 3], 120, 24)).toBe('0.00,24.00 60.00,12.00 120.00,0.00')
  })

  it('creates responsive minute-chart geometry from the available height', () => {
    expect(createMinuteChartGeometry(520)).toEqual({
      viewHeight: 520,
      priceBottom: 347,
      volumeTop: 369,
      volumeBottom: 494,
      xAxisY: 502,
      hoverTimeBoxY: 500,
      hoverTimeTextY: 513
    })
    expect(createMinuteChartGeometry(200).viewHeight).toBe(320)
  })

  it('limits isolated volume spikes without changing ordinary values', () => {
    expect(getRobustVolumeCeiling([])).toBe(1)
    expect(getRobustVolumeCeiling([10, 20, 30, 40])).toBe(30)
    expect(getRobustVolumeCeiling([10, 12, 14, 16, 18, 20, 1000])).toBe(20)
  })

  it('keeps an all-positive or all-negative sparkline on the correct side of its reference', () => {
    for (const prices of [[11, 12, 13], [7, 8, 9]]) {
      const model = createReferenceSparkline(prices, 10)
      expect(model.referenceY).not.toBeNull()
      expect(model.referenceY as number).toBeGreaterThan(0)
      expect(model.referenceY as number).toBeLessThan(24)
      const ys = model.points.split(' ').map((point) => Number(point.split(',')[1]))
      expect(ys.every((y) => prices[0] > 10 ? y < (model.referenceY as number) : y > (model.referenceY as number))).toBe(true)
    }
  })

  it('handles flat data and omits a reference when there is no valid baseline', () => {
    expect(createReferenceSparkline([10, 10], 10).referenceY).toBe(12)
    expect(createReferenceSparkline([10, 11], null).referenceY).toBeNull()
    expect(createReferenceSparkline([10], 10).points).toBe('')
  })
})
