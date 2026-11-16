import { describe, expect, it } from 'vitest'
import { createMinuteChartGeometry } from './chart'
import {
  CHART_HEIGHT,
  CHART_PADDING,
  CHART_WIDTH,
  clamp,
  createCandles,
  createMinuteAreaPath,
  createMinuteSignAreas,
  createMinuteSignPaths,
  createOrderBookRows,
  createPolyline,
  createXTicks,
  createYTicks,
  getDefaultKlineViewport,
  getHoverIndexFromClientX,
  getKlineYTickCount,
  getMinuteY,
  getPlotWidth,
  getX,
  getY
} from './detailChart'
import type { KlinePoint, OrderLevel } from '../api/stock'

function createPoint(overrides: Partial<KlinePoint> = {}): KlinePoint {
  return {
    time: '2026-09-24',
    open: 10,
    close: 11,
    high: 11.5,
    low: 9.5,
    volume: 1000,
    ...overrides
  } as KlinePoint
}

describe('detailChart geometry', () => {
  it('maps indexes and prices inside the padded plot area', () => {
    expect(getX(0, 5)).toBeCloseTo(CHART_PADDING.left)
    expect(getX(4, 5)).toBeCloseTo(CHART_PADDING.left + getPlotWidth())
    expect(getX(0, 1)).toBeCloseTo(CHART_PADDING.left + getPlotWidth() / 2)

    // 数值越小画得越靠下：min 落在底边，max 落在顶边
    expect(getY(10, 10, 20)).toBeCloseTo(CHART_HEIGHT - CHART_PADDING.bottom)
    expect(getY(20, 10, 20)).toBeCloseTo(CHART_PADDING.top)
    expect(clamp(5, 1, 3)).toBe(3)
    expect(clamp(-5, 1, 3)).toBe(1)
  })

  it('builds candles with a minimum body height and correct wicks', () => {
    const candles = createCandles([
      createPoint({ open: 10, close: 11, high: 11.5, low: 9.5 }),
      createPoint({ open: 10, close: 10, high: 10.2, low: 9.8 })
    ], 9, 12)

    expect(candles).toHaveLength(2)
    expect(candles[0].isUp).toBe(true)
    expect(candles[1].isUp).toBe(true)
    expect(candles[1].bodyHeight).toBeGreaterThan(1)
    expect(candles[0].wickTop).toBeLessThanOrEqual(Math.min(candles[0].openY, candles[0].closeY))
    expect(candles[0].wickBottom).toBeGreaterThanOrEqual(Math.max(candles[0].openY, candles[0].closeY))
  })

  it('skips NaN values when building polylines', () => {
    const path = createPolyline([10, Number.NaN, 12], 9, 13)
    expect(path.split(' ')).toHaveLength(2)
    expect(path).not.toContain('NaN')
  })

  it('closes the intraday area path on the price baseline', () => {
    const geometry = createMinuteChartGeometry(500)
    const path = createMinuteAreaPath([10, 10.2, 10.1], 9.8, 10.4, CHART_WIDTH, geometry)
    expect(path.startsWith('M')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
    expect(path).toContain(String(geometry.priceBottom))
  })

  it('creates unique, ordered x ticks and formatted dates', () => {
    const ticks = createXTicks(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'], 2)
    expect(ticks).toHaveLength(2)
    expect(ticks[0].label).toBe('2026-09-01')
    expect(ticks[1].label).toBe('2026-09-04')
    expect(createXTicks([], 4)).toEqual([])
    expect(createXTicks(['2026-09-01'])).toHaveLength(1)
  })

  it('creates y ticks from max to min', () => {
    const ticks = createYTicks(10, 20, 3)
    expect(ticks).toHaveLength(3)
    expect(ticks[0].y).toBeCloseTo(CHART_PADDING.top)
    expect(ticks[2].y).toBeCloseTo(CHART_HEIGHT - CHART_PADDING.bottom)
    expect(getKlineYTickCount('day')).toBe(4)
    expect(getKlineYTickCount('year')).toBe(6)
    expect(getKlineYTickCount('minute')).toBe(4)
  })
})

describe('detailChart order book', () => {
  it('reverses ask levels and pads missing levels with placeholders', () => {
    const asks: OrderLevel[] = [
      { price: 10.1, volume: 100 },
      { price: 10.2, volume: 200 }
    ]
    const rows = createOrderBookRows(asks, 'sell', 200)

    expect(rows.map((row) => row.label)).toEqual(['卖5', '卖4', '卖3', '卖2', '卖1'])
    expect(rows[4].priceText).toBe('10.10')
    expect(rows[3].priceText).toBe('10.20')
    expect(rows[0].priceText).toBe('--')
    expect(rows[4].depthPercent).toBe(50)
  })

  it('keeps bid levels in order and clamps depth percentages', () => {
    const bids: OrderLevel[] = [{ price: 9.9, volume: 1000 }]
    const rows = createOrderBookRows(bids, 'buy', 100)

    expect(rows[0].label).toBe('买1')
    expect(rows[0].priceText).toBe('9.90')
    expect(rows[0].depthPercent).toBe(100)
    expect(rows[1].depthPercent).toBe(0)
  })
})

describe('detailChart hover mapping', () => {
  it('clamps the hover index to the visible range', () => {
    const rect = { left: 0, width: CHART_WIDTH }
    const left = getHoverIndexFromClientX(0, rect, 10)
    const right = getHoverIndexFromClientX(CHART_WIDTH, rect, 10)

    expect(left?.index).toBe(0)
    expect(right?.index).toBe(9)
    expect(getHoverIndexFromClientX(0, { left: 0, width: 0 }, 10)).toBeNull()
    expect(getHoverIndexFromClientX(0, rect, 0)).toBeNull()
  })

  it('defaults the kline viewport to the full series', () => {
    expect(getDefaultKlineViewport(30)).toEqual({ start: 0, end: 30 })
  })
})

describe('detailChart minute sign colors', () => {
  const geometry = createMinuteChartGeometry(500)

  it('keeps a single red path when the whole line is above the reference', () => {
    const paths = createMinuteSignPaths([10.2, 10.3, 10.25], 10, 10, 10.4, CHART_WIDTH, geometry)
    expect(paths).toHaveLength(1)
    expect(paths[0].tone).toBe('up')
  })

  it('splits at the zero line and switches color when the price crosses it', () => {
    const paths = createMinuteSignPaths([10.2, 9.9, 10.1], 10, 9.8, 10.3, CHART_WIDTH, geometry)
    expect(paths.map((path) => path.tone)).toEqual(['up', 'down', 'up'])
    // 每一个断点都应落在昨收对应的 y 坐标上
    const zeroY = getMinuteY(10, 9.8, 10.3, geometry).toFixed(2)
    expect(paths[0].points.endsWith(zeroY)).toBe(true)
    expect(paths[1].points.startsWith(paths[0].points.split(' ').pop()!)).toBe(true)
  })

  it('paints exactly-at-reference points gray', () => {
    const paths = createMinuteSignPaths([10, 10, 10], 10, 9.8, 10.2, CHART_WIDTH, geometry)
    expect(paths).toHaveLength(1)
    expect(paths[0].tone).toBe('flat')
    expect(createMinuteSignPaths([], 10, 9, 11, CHART_WIDTH, geometry)).toEqual([])
  })
})

describe('detailChart minute sign area', () => {
  const geometry = createMinuteChartGeometry(500)

  it('closes each colored area on the reference line, not the chart bottom', () => {
    const areas = createMinuteSignAreas([10.2, 9.9, 10.1], 10, 9.8, 10.3, CHART_WIDTH, geometry)
    const zeroY = getMinuteY(10, 9.8, 10.3, geometry).toFixed(2)

    expect(areas.map((area) => area.tone)).toEqual(['up', 'down', 'up'])
    for (const area of areas) {
      expect(area.path.endsWith('Z')).toBe(true)
      expect(area.path.split(' ').filter((token) => token === zeroY).length + (area.path.includes(zeroY) ? 0 : 1)).toBeGreaterThan(0)
      expect(area.path.includes(` ${zeroY}`)).toBe(true)
    }
  })

  it('returns no area when the whole line sits exactly on the reference', () => {
    expect(createMinuteSignAreas([10, 10], 10, 9, 11, CHART_WIDTH, geometry)).toEqual([])
  })
})
