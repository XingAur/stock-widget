/**
 * 详情页图表几何：把 K 线 / 分时的纯计算从组件里抽出来，方便单测和复用。
 * 只做坐标换算和 SVG path 生成，不碰 Vue 状态。
 */
import type { KlinePoint, OrderLevel } from '../api/stock'
import { parseChartDate, type MinuteChartGeometry } from './chart'
import { formatOrderBookVolume, formatPrice } from './format'

export const CHART_WIDTH = 720
export const CHART_HEIGHT = 320
export const CHART_PADDING = { top: 18, right: 24, bottom: 44, left: 64 }
export const MIN_VISIBLE_KLINE_POINTS = 12

export interface XTick {
  label: string
  x: number
}

export interface YTick {
  label: string
  y: number
}

export interface CandleBar {
  x: number
  bodyWidth: number
  bodyY: number
  bodyHeight: number
  wickTop: number
  wickBottom: number
  openY: number
  closeY: number
  isUp: boolean
}

export interface MinuteVolumeBar {
  key: string
  x: number
  y: number
  width: number
  height: number
  tone: 'up' | 'down' | 'flat'
}

export type OrderBookSide = 'buy' | 'sell'

export interface OrderBookDisplayRow {
  label: string
  priceText: string
  volumeText: string
  side: OrderBookSide
  depthPercent: number
}

export interface KlineViewport {
  start: number
  end: number
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function getPlotWidth(viewWidth = CHART_WIDTH): number {
  return viewWidth - CHART_PADDING.left - CHART_PADDING.right
}

export function getPlotHeight(): number {
  return CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
}

export function getX(index: number, total: number, viewWidth = CHART_WIDTH): number {
  if (total <= 1) return CHART_PADDING.left + getPlotWidth(viewWidth) / 2
  return CHART_PADDING.left + (index / (total - 1)) * getPlotWidth(viewWidth)
}

export function getY(value: number, min: number, max: number): number {
  return CHART_PADDING.top + (1 - (value - min) / (max - min)) * getPlotHeight()
}

export function getMinuteY(value: number, min: number, max: number, geometry: MinuteChartGeometry): number {
  return CHART_PADDING.top
    + (1 - (value - min) / (max - min)) * (geometry.priceBottom - CHART_PADDING.top)
}

export function getCandleBodyWidth(total: number): number {
  if (total <= 1) return 10
  const step = getPlotWidth() / (total - 1)
  return clamp(step * 0.62, 4, 14)
}

export function createCandles(points: KlinePoint[], min: number, max: number): CandleBar[] {
  const minBodyHeight = 1.5
  const bodyWidth = getCandleBodyWidth(points.length)

  return points.map((point, index): CandleBar => {
    const x = getX(index, points.length)
    const openY = getY(point.open, min, max)
    const closeY = getY(point.close, min, max)
    const highY = getY(point.high, min, max)
    const lowY = getY(point.low, min, max)
    const bodyY = Math.min(openY, closeY)
    const rawBodyHeight = Math.abs(openY - closeY)

    return {
      x,
      bodyWidth,
      bodyY: rawBodyHeight < minBodyHeight ? bodyY - (minBodyHeight - rawBodyHeight) / 2 : bodyY,
      bodyHeight: Math.max(rawBodyHeight, minBodyHeight),
      wickTop: Math.min(highY, openY, closeY),
      wickBottom: Math.max(lowY, openY, closeY),
      openY,
      closeY,
      isUp: point.close >= point.open
    }
  })
}

export function createPolyline(values: number[], min: number, max: number, viewWidth = CHART_WIDTH): string {
  return values
    .map((value, index) => {
      if (Number.isNaN(value)) return null
      return `${getX(index, values.length, viewWidth).toFixed(2)},${getY(value, min, max).toFixed(2)}`
    })
    .filter((item): item is string => Boolean(item))
    .join(' ')
}

export function createMinutePolyline(
  values: number[],
  min: number,
  max: number,
  viewWidth: number,
  geometry: MinuteChartGeometry
): string {
  return values
    .map((value, index) => {
      if (Number.isNaN(value)) return null
      return `${getX(index, values.length, viewWidth).toFixed(2)},${getMinuteY(value, min, max, geometry).toFixed(2)}`
    })
    .filter((item): item is string => Boolean(item))
    .join(' ')
}

export function createMinuteAreaPath(
  values: number[],
  min: number,
  max: number,
  viewWidth: number,
  geometry: MinuteChartGeometry
): string {
  const visibleValues = values
    .map((value, index) => Number.isNaN(value) ? null : ({ index, value }))
    .filter((item): item is { index: number; value: number } => Boolean(item))
  if (visibleValues.length === 0) return ''

  const startX = getX(visibleValues[0].index, values.length, viewWidth)
  const endX = getX(visibleValues[visibleValues.length - 1].index, values.length, viewWidth)
  const path = visibleValues
    .map((item, index) => `${index === 0 ? 'M' : 'L'}${getX(item.index, values.length, viewWidth).toFixed(2)} ${getMinuteY(item.value, min, max, geometry).toFixed(2)}`)
    .join(' ')
  return `${path} L${endX.toFixed(2)} ${geometry.priceBottom} L${startX.toFixed(2)} ${geometry.priceBottom} Z`
}

export function formatXAxisLabel(value: string): string {
  const date = parseChartDate(value)
  if (!date) return value
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

export function createXTicks(labels: string[], maxCount = 5, viewWidth = CHART_WIDTH): XTick[] {
  if (labels.length === 0) return []
  if (labels.length === 1) {
    return [{ label: formatXAxisLabel(labels[0]), x: getX(0, 1, viewWidth) }]
  }

  const desiredTickCount = Math.min(maxCount, labels.length)
  const maxIndex = labels.length - 1
  const indexes: number[] = []

  for (let step = 0; step < desiredTickCount; step += 1) {
    indexes.push(Math.round((maxIndex * step) / (desiredTickCount - 1)))
  }

  return Array.from(new Set(indexes)).map((index) => ({
    label: formatXAxisLabel(labels[index]),
    x: getX(index, labels.length, viewWidth)
  }))
}

export function createYTicks(min: number, max: number, steps = 4): YTick[] {
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1)
    const value = max - (max - min) * ratio
    return {
      label: formatPrice(value),
      y: getY(value, min, max)
    }
  })
}

export function createMinuteYTicks(
  min: number,
  max: number,
  steps: number,
  geometry: MinuteChartGeometry
): YTick[] {
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1)
    const value = max - (max - min) * ratio
    return {
      label: formatPrice(value),
      y: getMinuteY(value, min, max, geometry)
    }
  })
}

export function getKlineYTickCount(tab: string): number {
  switch (tab) {
    case 'day':
      return 4
    case 'week':
    case 'month':
      return 5
    case 'quarter':
    case 'year':
      return 6
    default:
      return 4
  }
}

export function createOrderBookRows(
  levels: OrderLevel[],
  side: OrderBookSide,
  maxVolume: number
): OrderBookDisplayRow[] {
  const labels = side === 'sell' ? ['卖5', '卖4', '卖3', '卖2', '卖1'] : ['买1', '买2', '买3', '买4', '买5']
  const orderedLevels = side === 'sell'
    ? [...Array.from({ length: 5 }, (_, index) => levels[index] ?? null)].reverse()
    : Array.from({ length: 5 }, (_, index) => levels[index] ?? null)

  return labels.map((label, index) => {
    const level = orderedLevels[index]
    return {
      label,
      priceText: level ? formatPrice(level.price) : '--',
      volumeText: level ? formatOrderBookVolume(level.volume) : '--',
      side,
      depthPercent: level ? clamp(level.volume / maxVolume * 100, 2, 100) : 0
    }
  })
}

export function getDefaultKlineViewport(pointsLength: number): KlineViewport {
  return {
    start: 0,
    end: pointsLength
  }
}

/** 把鼠标位置换算成绘图索引（clientX → view 坐标 → 数据下标）。 */
export function getHoverIndexFromClientX(
  clientX: number,
  rect: { left: number; width: number },
  total: number,
  viewWidth = CHART_WIDTH
): { index: number; pointX: number } | null {
  if (total <= 0 || rect.width <= 0) return null

  const rawViewX = ((clientX - rect.left) / rect.width) * viewWidth
  const clampedViewX = clamp(rawViewX, CHART_PADDING.left, viewWidth - CHART_PADDING.right)
  const plotWidth = getPlotWidth(viewWidth)
  const ratio = plotWidth === 0 ? 0 : (clampedViewX - CHART_PADDING.left) / plotWidth
  const index = clamp(Math.round(ratio * (total - 1)), 0, total - 1)

  return {
    index,
    pointX: getX(index, total, viewWidth)
  }
}

export interface MinuteSignPath {
  tone: 'up' | 'down' | 'flat'
  points: string
}

/**
 * 分时线按“相对昨收”的正负分色：高于昨收走红、低于走绿、恰好等于走灰。
 * 穿越零轴时在交点处断开，保证每一段都是同一种颜色。
 */
export function createMinuteSignPaths(
  values: number[],
  zero: number,
  min: number,
  max: number,
  viewWidth: number,
  geometry: MinuteChartGeometry
): MinuteSignPath[] {
  const points = values
    .map((value, index) => Number.isNaN(value) ? null : ({ index, value }))
    .filter((item): item is { index: number; value: number } => Boolean(item))
  if (points.length === 0) return []

  const toneOf = (value: number): MinuteSignPath['tone'] => (
    value > zero ? 'up' : value < zero ? 'down' : 'flat'
  )
  const toXY = (index: number, value: number) => ({
    x: getX(index, values.length, viewWidth),
    y: getMinuteY(value, min, max, geometry)
  })

  const runs: { tone: MinuteSignPath['tone']; points: { x: number; y: number }[] }[] = []
  let current: { tone: MinuteSignPath['tone']; points: { x: number; y: number }[] } | null = null

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index]
    const to = points[index + 1]
    const fromTone = toneOf(from.value)
    const toTone = toneOf(to.value)

    if (!current) {
      current = { tone: fromTone, points: [toXY(from.index, from.value)] }
    }

    if (fromTone !== toTone && from.value !== to.value) {
      const ratio = (zero - from.value) / (to.value - from.value)
      const crossing = {
        x: getX(from.index + (to.index - from.index) * ratio, values.length, viewWidth),
        y: getMinuteY(zero, min, max, geometry)
      }
      current.points.push(crossing)
      runs.push(current)
      current = { tone: toTone, points: [crossing, toXY(to.index, to.value)] }
      continue
    }

    current.points.push(toXY(to.index, to.value))
  }

  if (current) {
    runs.push(current)
  }

  return runs.map((run) => ({
    tone: run.tone,
    points: run.points.map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')
  }))
}

export interface MinuteSignArea {
  tone: 'up' | 'down'
  path: string
}

/**
 * 分时面积图按“相对昨收”分块填充：高于昨收的部分填到昨收线下方，
 * 低于昨收的部分填到昨收线上方，避免整块矩形被染色。
 */
export function createMinuteSignAreas(
  values: number[],
  zero: number,
  min: number,
  max: number,
  viewWidth: number,
  geometry: MinuteChartGeometry
): MinuteSignArea[] {
  const segments = createMinuteSignPaths(values, zero, min, max, viewWidth, geometry)
  const zeroY = getMinuteY(zero, min, max, geometry).toFixed(2)
  const areas: MinuteSignArea[] = []

  for (const segment of segments) {
    if (segment.tone === 'flat' || !segment.points) continue
    const points = segment.points.trim()
    if (!points) continue
    const first = points.split(' ')[0]
    const last = points.split(' ').pop()
    if (!first || !last) continue
    const firstX = first.split(',')[0]
    const lastX = last.split(',')[0]
    areas.push({
      tone: segment.tone,
      path: `M${points.replace(/ /g, ' L')} L${lastX} ${zeroY} L${firstX} ${zeroY} Z`
    })
  }

  return areas
}
