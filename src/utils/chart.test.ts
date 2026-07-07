import { describe, expect, it } from 'vitest'
import {
  aggregateKlines,
  createMovingAverage,
  createSparklinePoints,
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
})
