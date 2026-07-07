<template>
  <div class="detail-view">
    <div v-if="settingsStore.settings.showIndices && indices.length > 0" class="detail-topbar">
      <div class="indices-strip">
        <div v-for="index in indices" :key="index.code" class="index-card">
          <span class="index-name">{{ index.name }}</span>
          <strong class="index-price">{{ index.price.toFixed(2) }}</strong>
          <span class="index-change" :class="{ up: index.changePercent >= 0, down: index.changePercent < 0 }">
            {{ formatSigned(index.change) }}({{ formatSignedPercent(index.changePercent) }})
          </span>
        </div>
      </div>
    </div>

    <div v-if="loading && !detail" class="detail-empty">加载中...</div>

    <div v-else-if="detail" class="detail-body">
      <header class="stock-header">
        <div class="stock-title">
          <h2>{{ detail.name }}</h2>
          <div class="stock-subtitle">{{ code }} {{ exchangeLabel }}</div>
        </div>

        <div class="price-panel">
          <div class="price-value">{{ detail.price.toFixed(2) }}</div>
          <div class="price-pill" :class="{ up: detail.changePercent >= 0, down: detail.changePercent < 0 }">
            {{ formatSignedPercent(detail.changePercent) }}
          </div>
        </div>
      </header>

      <section class="stats-grid">
        <div v-for="item in overviewItems" :key="item.label" class="stat-item" :class="{ compact: item.compact }">
          <span class="stat-label">{{ item.label }}</span>
          <span class="stat-value" v-html="item.value"></span>
        </div>
      </section>

      <section class="chart-card">
        <div class="tab-bar">
          <button
            v-for="tab in tabs"
            :key="tab.key"
            class="tab-btn"
            :class="{ active: activeTab === tab.key }"
            type="button"
            @click="switchTab(tab.key)"
          >
            {{ tab.label }}
          </button>
        </div>

        <div class="chart-meta">
          <template v-if="activeTab === 'minute' && minuteChartModel">
            <span class="legend-item"><span class="legend-dot latest" />最新 {{ minuteChartModel.latestPrice.toFixed(2) }}</span>
            <span class="legend-item"><span class="legend-dot avg" />均价 {{ minuteChartModel.avgPrice.toFixed(2) }}</span>
          </template>
          <template v-else-if="klineChartModel">
            <span class="legend-item"><span class="legend-dot latest" />收盘 {{ formatPrice(klineChartModel.latestClose) }}</span>
            <span class="legend-item"><span class="legend-dot dot-ma5"></span>MA5 {{ formatMA(klineChartModel.latestMA5) }}</span>
            <span class="legend-item"><span class="legend-dot dot-ma10"></span>MA10 {{ formatMA(klineChartModel.latestMA10) }}</span>
            <span class="legend-item"><span class="legend-dot dot-ma20"></span>MA20 {{ formatMA(klineChartModel.latestMA20) }}</span>
          </template>
        </div>

        <div class="chart-area">
          <div v-if="chartLoading" class="chart-empty">加载图表中...</div>

          <template v-else-if="activeTab === 'minute'">
            <div v-if="minuteChartModel" class="minute-layout">
              <div ref="minuteChartPanelRef" class="minute-chart-panel">
                <svg
                  class="chart-svg minute-chart-svg"
                  :viewBox="`0 0 ${minuteChartModel.viewWidth} 320`"
                  preserveAspectRatio="none"
                  @mousemove="handleMinuteHover"
                  @mouseleave="clearChartHover"
                >
                  <line
                    v-for="tick in minuteChartModel.yTicks"
                    :key="tick.label"
                    class="grid-line"
                    :x1="CHART_PADDING.left"
                    :x2="minuteChartModel.viewWidth - CHART_PADDING.right"
                    :y1="tick.y"
                    :y2="tick.y"
                  />
                  <text
                    v-for="tick in minuteChartModel.yTicks"
                    :key="`${tick.label}-y`"
                    :class="['axis-label', minuteAxisLabelClass]"
                    :x="14"
                    :y="tick.y + 4"
                  >
                    {{ tick.label }}
                  </text>
                  <path class="area-fill" :d="minuteChartModel.areaPath" />
                  <polyline class="chart-line chart-line-latest" :points="minuteChartModel.latestPath" />
                  <polyline class="chart-line chart-line-avg" :points="minuteChartModel.avgPath" />
                  <template v-if="minuteHover">
                    <line class="hover-line" :x1="minuteHover.x" :x2="minuteHover.x" :y1="CHART_PADDING.top" :y2="CHART_HEIGHT - CHART_PADDING.bottom" />
                    <line class="hover-line" :x1="CHART_PADDING.left" :x2="minuteChartModel.viewWidth - CHART_PADDING.right" :y1="minuteHover.latestY" :y2="minuteHover.latestY" />
                    <circle class="hover-point latest" :cx="minuteHover.x" :cy="minuteHover.latestY" r="3.4" />
                    <circle class="hover-point avg" :cx="minuteHover.x" :cy="minuteHover.avgY" r="2.8" />
                    <rect class="hover-price-bg" x="2" :y="minuteHover.latestY - 12" width="54" height="24" rx="6" />
                    <text class="hover-label-text" x="29" :y="minuteHover.latestY + 4" text-anchor="middle">
                      {{ minuteHover.latestPrice.toFixed(2) }}
                    </text>
                    <rect
                      class="hover-time-bg"
                      :x="clamp(minuteHover.x - 24, CHART_PADDING.left, minuteChartModel.viewWidth - CHART_PADDING.right - 48)"
                      y="304"
                      width="48"
                      height="18"
                      rx="4"
                    />
                    <text
                      class="hover-label-text"
                      :x="clamp(minuteHover.x, CHART_PADDING.left + 24, minuteChartModel.viewWidth - CHART_PADDING.right - 24)"
                      y="317"
                      text-anchor="middle"
                    >
                      {{ minuteHover.time }}
                    </text>
                  </template>
                  <text
                    v-for="tick in minuteChartModel.xTicks"
                    :key="`${tick.label}-x`"
                    :class="['axis-label', minuteAxisLabelClass]"
                    :x="tick.x"
                    :y="302"
                    text-anchor="middle"
                  >
                    {{ tick.label }}
                  </text>
                </svg>

                <div
                  v-if="minuteHover"
                  class="chart-tooltip"
                  :style="{ left: `${minuteHover.tooltipLeft}px`, top: `${minuteHover.tooltipTop}px` }"
                >
                  <div class="chart-tooltip-title">{{ minuteHover.time }}</div>
                  <div class="chart-tooltip-row">
                    <span class="tooltip-key"><span class="tooltip-dot latest"></span>最新</span>
                    <strong>{{ minuteHover.latestPrice.toFixed(2) }}</strong>
                  </div>
                  <div class="chart-tooltip-row">
                    <span class="tooltip-key"><span class="tooltip-dot avg"></span>均价</span>
                    <strong>{{ minuteHover.avgPrice.toFixed(3) }}</strong>
                  </div>
                </div>
                </div>

                <aside class="orderbook-panel">
                  <div class="orderbook-section">
                    <div v-for="row in sellOrderBookRows" :key="row.label" class="orderbook-row" :class="row.side">
                      <span class="orderbook-level">{{ row.label }}</span>
                      <strong class="orderbook-price">{{ row.priceText }}</strong>
                      <span class="orderbook-volume">{{ row.volumeText }}</span>
                    </div>
                  </div>
                  <div class="orderbook-divider"></div>
                  <div class="orderbook-section">
                    <div v-for="row in buyOrderBookRows" :key="row.label" class="orderbook-row" :class="row.side">
                      <span class="orderbook-level">{{ row.label }}</span>
                      <strong class="orderbook-price">{{ row.priceText }}</strong>
                      <span class="orderbook-volume">{{ row.volumeText }}</span>
                    </div>
                  </div>
              </aside>
            </div>

            <div v-if="!minuteChartModel" class="chart-empty">暂无图表数据</div>
          </template>

          <template v-else>
            <svg
              v-if="klineChartModel"
              class="chart-svg chart-svg-kline"
              :class="{ dragging: !!klinePanState }"
              viewBox="0 0 720 320"
              preserveAspectRatio="none"
              @wheel.prevent="handleKlineWheel"
              @pointerdown.prevent="handleKlinePanStart"
              @pointermove="handleKlinePanMove"
              @pointerup="handleKlinePanEnd"
              @pointercancel="handleKlinePanEnd"
              @lostpointercapture="handleKlinePanEnd"
              @mousemove="handleKlineHover"
              @mouseleave="handleKlinePointerLeave"
            >
              <line
                v-for="tick in klineChartModel.yTicks"
                :key="tick.label"
                class="grid-line"
                :x1="CHART_PADDING.left"
                :x2="CHART_WIDTH - CHART_PADDING.right"
                :y1="tick.y"
                :y2="tick.y"
              />
              <text
                v-for="tick in klineChartModel.yTicks"
                :key="`${tick.label}-y`"
                class="axis-label"
                :x="14"
                :y="tick.y + 4"
              >
                {{ tick.label }}
              </text>
              <template v-for="(candle, index) in klineChartModel.candles" :key="`${klineChartModel.points[index].time}-candle`">
                <line
                  class="k-candle-wick"
                  :class="{ up: candle.isUp, down: !candle.isUp }"
                  :x1="candle.x"
                  :x2="candle.x"
                  :y1="candle.wickTop"
                  :y2="candle.wickBottom"
                />
                <rect
                  class="k-candle-body"
                  :class="{ up: candle.isUp, down: !candle.isUp }"
                  :x="candle.x - candle.bodyWidth / 2"
                  :y="candle.bodyY"
                  :width="candle.bodyWidth"
                  :height="candle.bodyHeight"
                  rx="1"
                />
              </template>
              <polyline class="chart-line ma5-line" :points="klineChartModel.ma5Path" />
              <polyline class="chart-line ma10-line" :points="klineChartModel.ma10Path" />
              <polyline class="chart-line ma20-line" :points="klineChartModel.ma20Path" />
              <polyline class="chart-line ma30-line" :points="klineChartModel.ma30Path" />
              <template v-if="klineHover">
                <line class="hover-line" :x1="klineHover.x" :x2="klineHover.x" :y1="CHART_PADDING.top" :y2="CHART_HEIGHT - CHART_PADDING.bottom" />
                <line class="hover-line" :x1="CHART_PADDING.left" :x2="CHART_WIDTH - CHART_PADDING.right" :y1="klineHover.closeY" :y2="klineHover.closeY" />
                <circle class="hover-point latest" :cx="klineHover.x" :cy="klineHover.closeY" r="3.4" />
                <rect class="hover-price-bg" x="2" :y="klineHover.closeY - 12" width="54" height="24" rx="6" />
                <text class="hover-label-text" x="29" :y="klineHover.closeY + 4" text-anchor="middle">
                  {{ klineHover.close.toFixed(2) }}
                </text>
                <rect
                  class="hover-time-bg"
                  :x="clamp(klineHover.x - 36, CHART_PADDING.left, CHART_WIDTH - CHART_PADDING.right - 72)"
                  y="304"
                  width="72"
                  height="18"
                  rx="4"
                />
                <text
                  class="hover-label-text"
                  :x="clamp(klineHover.x, CHART_PADDING.left + 44, CHART_WIDTH - CHART_PADDING.right - 44)"
                  y="317"
                  text-anchor="middle"
                >
                  {{ klineHover.time }}
                </text>
              </template>
              <text
                v-for="tick in klineChartModel.xTicks"
                :key="`${tick.label}-x`"
                class="axis-label"
                :x="tick.x"
                :y="302"
                text-anchor="middle"
              >
                {{ tick.label }}
              </text>
            </svg>

            <div
              v-if="klineHover"
              class="chart-tooltip chart-tooltip-kline"
              :style="{ left: `${klineHover.tooltipLeft}px`, top: `${klineHover.tooltipTop}px` }"
            >
              <div class="chart-tooltip-title">{{ klineHover.time }}</div>
              <div class="chart-tooltip-row chart-tooltip-row-kline chart-tooltip-row-single">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline rise"></span>
                  <span class="tooltip-label">{{ activeTabLabel }}</span>
                </div>
              </div>
              <div class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline tooltip-dot-placeholder"></span>
                  <span class="tooltip-label">开盘</span>
                </div>
                <strong class="tooltip-value">{{ formatPrice(klineHover.open) }}</strong>
              </div>
              <div class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline tooltip-dot-placeholder"></span>
                  <span class="tooltip-label">收盘</span>
                </div>
                <strong class="tooltip-value">{{ formatPrice(klineHover.close) }}</strong>
              </div>
              <div class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline tooltip-dot-placeholder"></span>
                  <span class="tooltip-label">最低</span>
                </div>
                <strong class="tooltip-value">{{ formatPrice(klineHover.low) }}</strong>
              </div>
              <div class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline tooltip-dot-placeholder"></span>
                  <span class="tooltip-label">最高</span>
                </div>
                <strong class="tooltip-value">{{ formatPrice(klineHover.high) }}</strong>
              </div>
              <div v-if="formatMA(klineHover.ma5) !== '--'" class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline dot-ma5"></span>
                  <span class="tooltip-label">MA5</span>
                </div>
                <strong class="tooltip-value">{{ formatMA(klineHover.ma5) }}</strong>
              </div>
              <div v-if="formatMA(klineHover.ma10) !== '--'" class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline dot-ma10"></span>
                  <span class="tooltip-label">MA10</span>
                </div>
                <strong class="tooltip-value">{{ formatMA(klineHover.ma10) }}</strong>
              </div>
              <div v-if="formatMA(klineHover.ma20) !== '--'" class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline dot-ma20"></span>
                  <span class="tooltip-label">MA20</span>
                </div>
                <strong class="tooltip-value">{{ formatMA(klineHover.ma20) }}</strong>
              </div>
              <div v-if="formatMA(klineHover.ma30) !== '--'" class="chart-tooltip-row chart-tooltip-row-kline">
                <div class="tooltip-key-kline">
                  <span class="tooltip-dot tooltip-dot-kline dot-ma30"></span>
                  <span class="tooltip-label">MA30</span>
                </div>
                <strong class="tooltip-value">{{ formatMA(klineHover.ma30) }}</strong>
              </div>
            </div>

            <div v-if="!klineChartModel" class="chart-empty">暂无图表数据</div>
          </template>
        </div>
      </section>
    </div>

    <div v-else class="detail-empty">暂无详情数据</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  fetchIndices,
  fetchKlineData,
  fetchStockDetail,
  type ChartPeriod,
  type IndexData,
  type KlinePoint,
  type MinutePoint,
  type OrderLevel,
  type StockDetail
} from '../api/stock'
import { useSettingsStore } from '../stores/settings'
import { aggregateKlines, createMovingAverage, getRange, parseChartDate } from '../utils/chart'
import {
  formatAmount,
  formatMA,
  formatMarketCap,
  formatOrderBookVolume,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  formatVolume
} from '../utils/format'

type TabKey = 'minute' | 'day' | 'week' | 'month' | 'quarter' | 'year'

interface TabItem {
  key: TabKey
  label: string
  period?: ChartPeriod
}

interface XTick {
  label: string
  x: number
}

interface YTick {
  label: string
  y: number
}

interface MinuteChartModel {
  viewWidth: number
  points: MinutePoint[]
  avgPrices: number[]
  minPrice: number
  maxPrice: number
  latestPrice: number
  avgPrice: number
  latestPath: string
  avgPath: string
  areaPath: string
  yTicks: YTick[]
  xTicks: XTick[]
}

interface CandleBar {
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

interface KlineChartModel {
  points: KlinePoint[]
  candles: CandleBar[]
  minPrice: number
  maxPrice: number
  yTickCount: number
  ma5Values: number[]
  ma10Values: number[]
  ma20Values: number[]
  ma30Values: number[]
  latestClose: number
  latestMA5: number
  latestMA10: number
  latestMA20: number
  latestMA30: number
  ma5Path: string
  ma10Path: string
  ma20Path: string
  ma30Path: string
  yTicks: YTick[]
  xTicks: XTick[]
}

interface MinuteHoverState {
  x: number
  latestY: number
  avgY: number
  time: string
  latestPrice: number
  avgPrice: number
  tooltipLeft: number
  tooltipTop: number
}

interface KlineHoverState {
  x: number
  closeY: number
  time: string
  open: number
  close: number
  high: number
  low: number
  ma5: number
  ma10: number
  ma20: number
  ma30: number
  tooltipLeft: number
  tooltipTop: number
}

type OrderBookSide = 'buy' | 'sell'

interface OrderBookDisplayRow {
  label: string
  priceText: string
  volumeText: string
  side: OrderBookSide
}

interface KlineViewport {
  start: number
  end: number
}

interface KlinePanState {
  pointerId: number
  startClientX: number
  startViewport: KlineViewport
  tab: Exclude<TabKey, 'minute'>
  visibleCount: number
}

const CHART_WIDTH = 720
const CHART_HEIGHT = 320
const CHART_PADDING = { top: 18, right: 24, bottom: 44, left: 64 }
const MIN_VISIBLE_KLINE_POINTS = 12

const tabs: TabItem[] = [
  { key: 'minute', label: '分时' },
  { key: 'day', label: '日K', period: 'day' },
  { key: 'week', label: '周K', period: 'week' },
  { key: 'month', label: '月K', period: 'month' },
  { key: 'quarter', label: '季K', period: 'month' },
  { key: 'year', label: '年K', period: 'month' }
]

const props = defineProps<{ code: string }>()
defineEmits<{ close: [] }>()

const settingsStore = useSettingsStore()

const detail = ref<StockDetail | null>(null)
const indices = ref<IndexData[]>([])
const activeTab = ref<TabKey>('minute')
const loading = ref(false)
const chartLoading = ref(false)
const klineCache = ref<Partial<Record<Exclude<TabKey, 'minute'>, KlinePoint[]>>>({})
const klineViewports = ref<Partial<Record<Exclude<TabKey, 'minute'>, KlineViewport>>>({})
const minuteHover = ref<MinuteHoverState | null>(null)
const klineHover = ref<KlineHoverState | null>(null)
const klinePanState = ref<KlinePanState | null>(null)
const minuteChartPanelRef = ref<HTMLElement | null>(null)
const minuteChartPanelWidth = ref(0)

let refreshTimer: number | null = null
let minuteChartResizeObserver: ResizeObserver | null = null

const exchangeLabel = computed(() => {
  if (props.code.startsWith('6')) return '沪A'
  if (props.code.startsWith('0') || props.code.startsWith('3')) return '深A'
  return '市场'
})

const activeTabLabel = computed(() => tabs.find((tab) => tab.key === activeTab.value)?.label ?? 'K线')
const minuteXTickCount = computed(() => {
  if (minuteChartPanelWidth.value <= 0) return 6
  if (minuteChartPanelWidth.value < 360) return 3
  if (minuteChartPanelWidth.value < 440) return 4
  if (minuteChartPanelWidth.value < 560) return 5
  return 6
})
const minuteYTickCount = computed(() => minuteChartPanelWidth.value < 440 ? 3 : 4)
const minuteAxisLabelClass = computed(() => minuteChartPanelWidth.value < 440 ? 'axis-label-compact' : '')
const minuteChartViewWidth = computed(() => Math.max(Math.round(minuteChartPanelWidth.value || CHART_WIDTH), 320))

const overviewItems = computed(() => {
  if (!detail.value) return []

  return [
    { label: '最高', value: detail.value.high.toFixed(2) },
    { label: '今开', value: detail.value.open.toFixed(2) },
    { label: '成交量', value: formatVolume(detail.value.volume) },
    { label: '总市值', value: formatMarketCap(detail.value.totalMarketCap), compact: true },
    { label: '最低', value: detail.value.low.toFixed(2) },
    { label: '昨收', value: detail.value.prevClose.toFixed(2) },
    { label: '成交额', value: formatAmount(detail.value.amount) },
    { label: '流通市值', value: formatMarketCap(detail.value.circulationMarketCap), compact: true }
  ]
})

const sellOrderBookRows = computed(() => createOrderBookRows(detail.value?.orderBook?.asks ?? [], 'sell'))
const buyOrderBookRows = computed(() => createOrderBookRows(detail.value?.orderBook?.bids ?? [], 'buy'))

const currentKlinePoints = computed(() => {
  if (activeTab.value === 'minute') return []

  const dayPoints = klineCache.value.day ?? []
  const weekPoints = klineCache.value.week?.length ? klineCache.value.week : aggregateKlines(dayPoints, 'week')
  const monthPoints = klineCache.value.month?.length ? klineCache.value.month : aggregateKlines(dayPoints, 'month')

  switch (activeTab.value) {
    case 'day':
      return dayPoints
    case 'week':
      return weekPoints
    case 'month':
      return monthPoints
    case 'quarter':
      return aggregateKlines(monthPoints.length ? monthPoints : dayPoints, 'quarter')
    case 'year':
      return aggregateKlines(monthPoints.length ? monthPoints : dayPoints, 'year')
    default:
      return []
  }
})

const visibleKlinePoints = computed(() => {
  const points = currentKlinePoints.value
  if (points.length === 0 || activeTab.value === 'minute') return []

  const viewport = klineViewports.value[activeTab.value]
  if (!viewport) return points

  const start = clamp(Math.round(viewport.start), 0, Math.max(points.length - 1, 0))
  const end = clamp(Math.round(viewport.end), start + 1, points.length)
  return points.slice(start, end)
})

const minuteChartModel = computed<MinuteChartModel | null>(() => {
  const points = detail.value?.minute ?? []
  if (points.length === 0) return null

  let cumulativeAmount = 0
  let cumulativeVolume = 0
  const avgPrices = points.map((point) => {
    cumulativeAmount += point.price * point.volume
    cumulativeVolume += point.volume
    return cumulativeVolume > 0 ? cumulativeAmount / cumulativeVolume : point.price
  })

  const [minPrice, maxPrice] = getRange([...points.map((point) => point.price), ...avgPrices])
  const viewWidth = minuteChartViewWidth.value

  return {
    viewWidth,
    points,
    avgPrices,
    minPrice,
    maxPrice,
    latestPrice: points[points.length - 1].price,
    avgPrice: avgPrices[avgPrices.length - 1],
    latestPath: createPolyline(points.map((point) => point.price), minPrice, maxPrice, viewWidth),
    avgPath: createPolyline(avgPrices, minPrice, maxPrice, viewWidth),
    areaPath: createAreaPath(points.map((point) => point.price), minPrice, maxPrice, viewWidth),
    yTicks: createYTicks(minPrice, maxPrice, minuteYTickCount.value, viewWidth),
    xTicks: createXTicks(points.map((point) => point.time), minuteXTickCount.value, viewWidth)
  }
})

const klineChartModel = computed<KlineChartModel | null>(() => {
  const allPoints = currentKlinePoints.value
  const points = visibleKlinePoints.value
  if (allPoints.length === 0 || points.length === 0) return null

  const viewport = activeTab.value === 'minute'
    ? null
    : klineViewports.value[activeTab.value]
  const rangeStart = viewport ? clamp(Math.round(viewport.start), 0, Math.max(allPoints.length - 1, 0)) : 0
  const rangeEnd = viewport ? clamp(Math.round(viewport.end), rangeStart + 1, allPoints.length) : allPoints.length

  const closes = allPoints.map((point) => point.close)
  const ma5 = createMovingAverage(closes, 5).slice(rangeStart, rangeEnd)
  const ma10 = createMovingAverage(closes, 10).slice(rangeStart, rangeEnd)
  const ma20 = createMovingAverage(closes, 20).slice(rangeStart, rangeEnd)
  const ma30 = createMovingAverage(closes, 30).slice(rangeStart, rangeEnd)
  const [minPrice, maxPrice] = getRange([
    ...points.flatMap((point) => [point.open, point.close, point.high, point.low]),
    ...ma5.filter((value) => !Number.isNaN(value)),
    ...ma10.filter((value) => !Number.isNaN(value)),
    ...ma20.filter((value) => !Number.isNaN(value)),
    ...ma30.filter((value) => !Number.isNaN(value))
  ])
  const yTickCount = getKlineYTickCount(activeTab.value)

  return {
    points,
    candles: createCandles(points, minPrice, maxPrice),
    minPrice,
    maxPrice,
    yTickCount,
    ma5Values: ma5,
    ma10Values: ma10,
    ma20Values: ma20,
    ma30Values: ma30,
    latestClose: closes[closes.length - 1],
    latestMA5: ma5[ma5.length - 1],
    latestMA10: ma10[ma10.length - 1],
    latestMA20: ma20[ma20.length - 1],
    latestMA30: ma30[ma30.length - 1],
    ma5Path: createPolyline(ma5, minPrice, maxPrice),
    ma10Path: createPolyline(ma10, minPrice, maxPrice),
    ma20Path: createPolyline(ma20, minPrice, maxPrice),
    ma30Path: createPolyline(ma30, minPrice, maxPrice),
    yTicks: createYTicks(minPrice, maxPrice, yTickCount),
    xTicks: createXTicks(points.map((point) => point.time), 3)
  }
})

function createOrderBookRows(levels: OrderLevel[], side: OrderBookSide): OrderBookDisplayRow[] {
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
      side
    }
  })
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function clearChartHover() {
  minuteHover.value = null
  klineHover.value = null
}

function getActiveKlineTab(): Exclude<TabKey, 'minute'> | null {
  return activeTab.value === 'minute' ? null : activeTab.value
}

function getDefaultKlineViewport(pointsLength: number): KlineViewport {
  return {
    start: 0,
    end: pointsLength
  }
}

function getResolvedKlineViewport(tab: Exclude<TabKey, 'minute'>, pointsLength: number): KlineViewport {
  const viewport = klineViewports.value[tab]
  if (!viewport) return getDefaultKlineViewport(pointsLength)

  const start = clamp(Math.round(viewport.start), 0, Math.max(pointsLength - 1, 0))
  const end = clamp(Math.round(viewport.end), start + 1, pointsLength)
  return { start, end }
}

function setKlineViewport(tab: Exclude<TabKey, 'minute'>, pointsLength: number, nextStart: number, visibleCount: number) {
  const nextViewports = { ...klineViewports.value }

  if (visibleCount >= pointsLength) {
    delete nextViewports[tab]
  } else {
    const start = clamp(Math.round(nextStart), 0, Math.max(pointsLength - visibleCount, 0))
    nextViewports[tab] = {
      start,
      end: start + visibleCount
    }
  }

  klineViewports.value = nextViewports
}

function syncMinuteChartPanelWidth() {
  minuteChartPanelWidth.value = minuteChartPanelRef.value?.clientWidth ?? 0
}

function getPlotWidth(viewWidth = CHART_WIDTH): number {
  return viewWidth - CHART_PADDING.left - CHART_PADDING.right
}

function getPlotHeight(): number {
  return CHART_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom
}

function getX(index: number, total: number, viewWidth = CHART_WIDTH): number {
  if (total <= 1) return CHART_PADDING.left + getPlotWidth(viewWidth) / 2
  return CHART_PADDING.left + (index / (total - 1)) * getPlotWidth(viewWidth)
}

function getY(value: number, min: number, max: number): number {
  return CHART_PADDING.top + (1 - (value - min) / (max - min)) * getPlotHeight()
}

function getCandleBodyWidth(total: number): number {
  if (total <= 1) return 10
  const step = getPlotWidth() / (total - 1)
  return clamp(step * 0.62, 4, 14)
}

function createCandles(points: KlinePoint[], min: number, max: number): CandleBar[] {
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

function createPolyline(values: number[], min: number, max: number, viewWidth = CHART_WIDTH): string {
  return values
    .map((value, index) => {
      if (Number.isNaN(value)) return null
      return `${getX(index, values.length, viewWidth).toFixed(2)},${getY(value, min, max).toFixed(2)}`
    })
    .filter((item): item is string => Boolean(item))
    .join(' ')
}

function createAreaPath(values: number[], min: number, max: number, viewWidth = CHART_WIDTH): string {
  const visibleValues = values
    .map((value, index) => Number.isNaN(value) ? null : ({ index, value }))
    .filter((item): item is { index: number; value: number } => Boolean(item))

  if (visibleValues.length === 0) return ''

  const baselineY = CHART_HEIGHT - CHART_PADDING.bottom
  const startX = getX(visibleValues[0].index, values.length, viewWidth)
  const endX = getX(visibleValues[visibleValues.length - 1].index, values.length, viewWidth)
  const path = visibleValues
    .map((item, index) => `${index === 0 ? 'M' : 'L'}${getX(item.index, values.length, viewWidth).toFixed(2)} ${getY(item.value, min, max).toFixed(2)}`)
    .join(' ')

  return `${path} L${endX.toFixed(2)} ${baselineY.toFixed(2)} L${startX.toFixed(2)} ${baselineY.toFixed(2)} Z`
}

function formatXAxisLabel(value: string): string {
  const date = parseChartDate(value)
  if (!date) return value
  return `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')}`
}

function createXTicks(labels: string[], maxCount = 5, viewWidth = CHART_WIDTH): XTick[] {
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

function formatYAxisLabel(value: number): string {
  return formatPrice(value)
}

function getKlineYTickCount(tab: TabKey): number {
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

function createYTicks(min: number, max: number, steps = 4, _viewWidth = CHART_WIDTH): YTick[] {
  return Array.from({ length: steps }, (_, index) => {
    const ratio = index / (steps - 1)
    const value = max - (max - min) * ratio
    return {
      label: activeTab.value === 'minute' ? formatPrice(value) : formatYAxisLabel(value),
      y: getY(value, min, max)
    }
  })
}

function getHoverIndex(event: MouseEvent, total: number, viewWidth = CHART_WIDTH) {
  const svg = event.currentTarget as SVGSVGElement
  const rect = svg.getBoundingClientRect()
  if (total <= 0 || rect.width <= 0 || rect.height <= 0) return null

  const rawViewX = ((event.clientX - rect.left) / rect.width) * viewWidth
  const clampedViewX = clamp(rawViewX, CHART_PADDING.left, viewWidth - CHART_PADDING.right)
  const ratio = getPlotWidth(viewWidth) === 0 ? 0 : (clampedViewX - CHART_PADDING.left) / getPlotWidth(viewWidth)
  const index = clamp(Math.round(ratio * (total - 1)), 0, total - 1)

  return {
    rect,
    index,
    pointX: getX(index, total, viewWidth)
  }
}

function getTooltipPosition(rect: DOMRect, pointX: number, pointY: number, width: number, height: number, viewWidth = CHART_WIDTH) {
  const pixelX = (pointX / viewWidth) * rect.width
  const pixelY = (pointY / CHART_HEIGHT) * rect.height

  return {
    left: clamp(pixelX + 12, 12, Math.max(12, rect.width - width - 12)),
    top: clamp(pixelY - height / 2, 12, Math.max(12, rect.height - height - 12))
  }
}

function handleKlineWheel(event: WheelEvent) {
  const tab = getActiveKlineTab()
  if (!tab) return

  const points = currentKlinePoints.value
  if (points.length <= MIN_VISIBLE_KLINE_POINTS) return

  const viewport = getResolvedKlineViewport(tab, points.length)
  const visibleCount = viewport.end - viewport.start
  const zoomFactor = event.deltaY < 0 ? 0.8 : 1.25
  const nextVisibleCount = clamp(
    Math.round(visibleCount * zoomFactor),
    MIN_VISIBLE_KLINE_POINTS,
    points.length
  )

  if (nextVisibleCount === visibleCount) return

  const hover = getHoverIndex(event, visibleCount)
  const anchorIndexInVisible = hover?.index ?? Math.max(visibleCount - 1, 0)
  const anchorIndexGlobal = viewport.start + anchorIndexInVisible
  const anchorRatio = visibleCount <= 1 ? 1 : anchorIndexInVisible / (visibleCount - 1)
  const maxStart = Math.max(points.length - nextVisibleCount, 0)
  const nextStart = clamp(
    Math.round(anchorIndexGlobal - anchorRatio * (nextVisibleCount - 1)),
    0,
    maxStart
  )

  setKlineViewport(tab, points.length, nextStart, nextVisibleCount)
  clearChartHover()
}

function handleKlinePanStart(event: PointerEvent) {
  const tab = getActiveKlineTab()
  if (!tab || !klineChartModel.value) return

  const points = currentKlinePoints.value
  const viewport = getResolvedKlineViewport(tab, points.length)
  const visibleCount = viewport.end - viewport.start
  if (visibleCount >= points.length) return

  const svg = event.currentTarget as SVGSVGElement
  svg.setPointerCapture(event.pointerId)

  klinePanState.value = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startViewport: viewport,
    tab,
    visibleCount
  }
  clearChartHover()
}

function handleKlinePanMove(event: PointerEvent) {
  if (!klinePanState.value || event.pointerId !== klinePanState.value.pointerId) return

  const points = currentKlinePoints.value
  if (points.length === 0) return

  const deltaX = event.clientX - klinePanState.value.startClientX
  const deltaPoints = Math.round((deltaX / getPlotWidth()) * klinePanState.value.visibleCount)
  const nextStart = klinePanState.value.startViewport.start - deltaPoints
  setKlineViewport(klinePanState.value.tab, points.length, nextStart, klinePanState.value.visibleCount)
  clearChartHover()
}

function handleKlinePanEnd(event: PointerEvent) {
  if (!klinePanState.value || event.pointerId !== klinePanState.value.pointerId) return

  const svg = event.currentTarget as SVGSVGElement
  if (svg.hasPointerCapture(event.pointerId)) {
    svg.releasePointerCapture(event.pointerId)
  }

  klinePanState.value = null
}

function handleKlinePointerLeave() {
  if (!klinePanState.value) {
    clearChartHover()
  }
}

function handleMinuteHover(event: MouseEvent) {
  if (!minuteChartModel.value) return

  const hover = getHoverIndex(event, minuteChartModel.value.points.length, minuteChartModel.value.viewWidth)
  if (!hover) return

  const point = minuteChartModel.value.points[hover.index]
  const avgPrice = minuteChartModel.value.avgPrices[hover.index]
  const latestY = getY(point.price, minuteChartModel.value.minPrice, minuteChartModel.value.maxPrice)
  const avgY = getY(avgPrice, minuteChartModel.value.minPrice, minuteChartModel.value.maxPrice)
  const tooltip = getTooltipPosition(hover.rect, hover.pointX, latestY, 142, 86, minuteChartModel.value.viewWidth)

  minuteHover.value = {
    x: hover.pointX,
    latestY,
    avgY,
    time: point.time,
    latestPrice: point.price,
    avgPrice,
    tooltipLeft: tooltip.left,
    tooltipTop: tooltip.top
  }
}

function handleKlineHover(event: MouseEvent) {
  if (!klineChartModel.value) return

  const hover = getHoverIndex(event, klineChartModel.value.points.length)
  if (!hover) return

  const point = klineChartModel.value.points[hover.index]
  const closeY = getY(point.close, klineChartModel.value.minPrice, klineChartModel.value.maxPrice)
  const tooltip = getTooltipPosition(hover.rect, hover.pointX, closeY, 220, 214)

  klineHover.value = {
    x: hover.pointX,
    closeY,
    time: point.time,
    open: point.open,
    close: point.close,
    high: point.high,
    low: point.low,
    ma5: klineChartModel.value.ma5Values[hover.index],
    ma10: klineChartModel.value.ma10Values[hover.index],
    ma20: klineChartModel.value.ma20Values[hover.index],
    ma30: klineChartModel.value.ma30Values[hover.index],
    tooltipLeft: tooltip.left,
    tooltipTop: tooltip.top
  }
}

async function loadIndices() {
  if (!settingsStore.settings.showIndices) {
    indices.value = []
    return
  }

  indices.value = await fetchIndices()
}

async function loadBaseDetail() {
  detail.value = await fetchStockDetail(props.code)
}

async function loadKline(tab: Exclude<TabKey, 'minute'>) {
  chartLoading.value = true
  try {
    const period = tabs.find((item) => item.key === tab)?.period ?? 'day'
    const result = await fetchKlineData(props.code, period)
    const normalizedResult = result.length || period === 'day'
      ? result
      : tab === 'week'
        ? aggregateKlines(klineCache.value.day ?? [], 'week')
        : aggregateKlines(klineCache.value.day ?? [], 'month')
    const nextCache = {
      ...klineCache.value,
      [tab]: normalizedResult
    }

    if (tab === 'month' || tab === 'quarter' || tab === 'year') {
      nextCache.month = normalizedResult
      nextCache.quarter = normalizedResult
      nextCache.year = normalizedResult
    }

    klineCache.value = nextCache
  } finally {
    chartLoading.value = false
  }
}

async function preloadKlines() {
  chartLoading.value = true
  try {
    const [day, week, month] = await Promise.all([
      fetchKlineData(props.code, 'day'),
      fetchKlineData(props.code, 'week'),
      fetchKlineData(props.code, 'month')
    ])
    const normalizedDay = day.length ? day : detail.value?.kline ?? []
    const normalizedWeek = week.length ? week : aggregateKlines(normalizedDay, 'week')
    const normalizedMonth = month.length ? month : aggregateKlines(normalizedDay, 'month')

    klineCache.value = {
      day: normalizedDay,
      week: normalizedWeek,
      month: normalizedMonth,
      quarter: normalizedMonth,
      year: normalizedMonth
    }
  } finally {
    chartLoading.value = false
  }
}

async function loadAll() {
  loading.value = true
  clearChartHover()
  try {
    await Promise.all([loadBaseDetail(), loadIndices(), preloadKlines()])
  } finally {
    loading.value = false
  }
}

async function switchTab(tab: TabKey) {
  if (activeTab.value === tab) return
  activeTab.value = tab
  clearChartHover()

  if (tab !== 'minute' && !currentKlinePoints.value.length) {
    await loadKline(tab)
  }
}

watch(() => props.code, async () => {
  activeTab.value = 'minute'
  klineCache.value = {}
  klineViewports.value = {}
  await loadAll()
})

watch(() => settingsStore.settings.showIndices, () => {
  void loadIndices()
})

onMounted(async () => {
  await loadAll()
  syncMinuteChartPanelWidth()
  if (typeof ResizeObserver !== 'undefined' && minuteChartPanelRef.value) {
    minuteChartResizeObserver = new ResizeObserver(() => {
      syncMinuteChartPanelWidth()
    })
    minuteChartResizeObserver.observe(minuteChartPanelRef.value)
  }
  refreshTimer = window.setInterval(() => {
    void loadAll()
  }, 30000)
})

onUnmounted(() => {
  minuteChartResizeObserver?.disconnect()
  minuteChartResizeObserver = null
  if (refreshTimer) clearInterval(refreshTimer)
})
</script>

<style scoped>
.detail-view{height:100%;display:flex;flex-direction:column;overflow:hidden;padding:14px 18px 16px;background:var(--window-bg)}
.detail-topbar{display:flex;align-items:flex-start;gap:12px;padding-bottom:12px;border-bottom:1px solid var(--border-color)}
.indices-strip{flex:1;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
.index-card{display:flex;flex-direction:column;gap:2px;min-width:0}
.index-name{font-size:12px;color:rgba(255,255,255,.72);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.index-price{font-size:15px;font-weight:700;color:#f5f5f5;line-height:1.1}
.index-change{font-size:11px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.index-change.up{color:#ff6b6b}
.index-change.down{color:#33c26f}
.detail-body{flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto;overflow-x:hidden;padding-right:4px;scrollbar-width:none;-ms-overflow-style:none}
.stock-header{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:16px 0 10px}
.stock-title{display:flex;align-items:baseline;gap:8px;min-width:0;flex-wrap:wrap}
.stock-title h2{margin:0;font-size:20px;line-height:1.08;font-weight:800;color:#fff}
.stock-subtitle{margin-top:0;font-size:13px;line-height:1.08;color:rgba(255,255,255,.68);white-space:nowrap}
.price-panel{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
.price-value{font-size:14px;line-height:1;font-weight:650;color:var(--text-primary)}
.price-pill{min-width:92px;padding:6px 12px;border-radius:999px;text-align:center;font-size:14px;font-weight:800}
.price-pill.up{color:#ff7474;background:rgba(239,68,68,.14)}
.price-pill.down{color:#3ad283;background:rgba(34,197,94,.12)}
.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:0;padding:8px 0 10px;border-top:1px solid rgba(255,255,255,.08);border-bottom:1px solid rgba(255,255,255,.08)}
.stat-item{display:flex;flex-direction:column;gap:4px;padding:6px 12px}
.stat-item.compact .stat-value{font-size:16px;font-weight:700;color:var(--text-primary)}
.stat-label{font-size:12px;color:var(--text-muted)}
.stat-value{font-size:16px;font-weight:700;color:var(--text-primary)}
:deep(.stat-unit){font-size:12px;font-weight:400;color:var(--text-muted)}
.chart-card{flex:none;min-height:0;display:flex;flex-direction:column;padding-top:8px}
.tab-bar{display:flex;align-items:center;gap:28px;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,.08)}
.tab-btn{position:relative;padding:0;border:none;background:transparent;color:rgba(255,255,255,.72);font-size:14px;font-weight:700;cursor:pointer}
.tab-btn.active{color:#2d9cff}
.tab-btn.active::after{content:'';position:absolute;left:0;right:0;bottom:-11px;height:2px;border-radius:999px;background:#2d9cff}
.chart-meta{display:flex;align-items:center;gap:12px;min-height:28px;padding:12px 0 8px;color:rgba(255,255,255,.74);font-size:12px;justify-content:flex-start;flex-wrap:nowrap;overflow:hidden}
.legend-item{display:inline-flex;align-items:center;gap:4px;line-height:1.2;white-space:nowrap;flex:0 0 auto}
.legend-dot{width:8px;height:8px;border-radius:999px}
.legend-dot.latest{background:#1d9bf0}
.legend-dot.avg{background:#f59e0b}
.legend-dot.dot-ma5{background:#5d7cf6}
.legend-dot.dot-ma10{background:#b8d72f}
.legend-dot.dot-ma20{background:#6d6ea6}
.legend-dot.dot-ma30{background:#ffa04a}
.chart-area{flex:1;min-height:320px;position:relative}
.minute-layout{display:flex;align-items:stretch;gap:16px;min-height:320px;height:100%}
.minute-chart-panel{position:relative;flex:1;min-width:0;min-height:320px}
.orderbook-panel{width:160px;flex:0 0 160px;padding:12px 0 0 14px;border-left:1px solid rgba(255,255,255,.08);display:flex;flex-direction:column;justify-content:flex-start;gap:10px}
.orderbook-row{display:grid;grid-template-columns:28px 1fr auto;align-items:center;column-gap:10px}
.orderbook-volume{text-align:right}
.orderbook-section{display:flex;flex-direction:column;gap:4px}
.orderbook-row{min-height:24px;font-size:12px}
.orderbook-level{color:rgba(243,246,255,.72)}
.orderbook-price{font-weight:700;text-align:left}
.orderbook-volume{color:rgba(243,246,255,.78);font-variant-numeric:tabular-nums}
.orderbook-row.sell .orderbook-price{color:#ff7474}
.orderbook-row.buy .orderbook-price{color:#3ad283}
.orderbook-divider{height:1px;background:rgba(255,255,255,.08);margin:2px 0}
.chart-svg{width:100%;height:100%;display:block;min-height:320px}
.chart-svg-kline{cursor:grab;touch-action:none}
.chart-svg-kline.dragging{cursor:grabbing}
.grid-line{stroke:rgba(255,255,255,.07);stroke-width:1}
.axis-label{fill:rgba(255,255,255,.42);font-size:11px}
.axis-label-compact{font-size:9px}
.area-fill{fill:rgba(29,155,240,.18)}
.kline-fill{fill:rgba(29,155,240,.14)}
.chart-line{fill:none;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
.chart-line-latest{stroke:#1d9bf0}
.chart-line-avg{stroke:#f59e0b;stroke-dasharray:4 3;opacity:.85}
.ma5-line{stroke:#5d7cf6}
.ma10-line{stroke:#b8d72f}
.ma20-line{stroke:#6d6ea6}
.ma30-line{stroke:#ffa04a}
.k-candle-wick{stroke-width:1.2}
.k-candle-wick.up{stroke:#56e788}
.k-candle-wick.down{stroke:#ff5b6e}
.k-candle-body.up{fill:#56e788}
.k-candle-body.down{fill:#ff5b6e}
.hover-line{stroke:rgba(255,255,255,.38);stroke-width:1;stroke-dasharray:4 3}
.hover-point{stroke:#121212;stroke-width:1.4}
.hover-point.latest{fill:#1d9bf0}
.hover-point.avg{fill:#f59e0b}
.hover-price-bg{fill:#5f70ad}
.hover-time-bg{fill:#4c5361}
.hover-label-text{fill:#f3f6ff;font-size:11px;font-weight:700}
.chart-tooltip{position:absolute;z-index:2;width:142px;padding:10px 12px;border:1px solid var(--border-color);border-radius:8px;background:var(--solid-bg);box-shadow:0 14px 28px rgba(0,0,0,.22);backdrop-filter:blur(6px);pointer-events:none}
.chart-tooltip-kline{width:220px;display:flex;flex-direction:column;gap:2px}
.chart-tooltip-title{font-size:11px;font-weight:700;color:#eef3ff;margin-bottom:8px;text-align:left}
.chart-tooltip-row{display:flex;align-items:center;justify-content:space-between;gap:10px;color:#f3f6ff;font-size:11px;line-height:1.5;white-space:nowrap}
.chart-tooltip-row-single{justify-content:flex-start}
.chart-tooltip-row strong{min-width:48px;text-align:right;font-weight:700;flex-shrink:0}
.chart-tooltip-row-kline{min-height:20px;justify-content:flex-start;gap:0}
.tooltip-key{display:inline-flex;align-items:center;gap:6px;color:rgba(243,246,255,.82);flex-shrink:0}
.tooltip-key-kline{display:flex;align-items:center;gap:6px;width:78px;min-width:78px;flex:0 0 78px}
.tooltip-label{color:rgba(243,246,255,.82);min-width:0}
.tooltip-value{margin-left:auto;min-width:48px;text-align:right;font-weight:700;flex:0 0 auto}
.tooltip-dot{width:8px;height:8px;border-radius:999px;display:inline-block;flex-shrink:0}
.tooltip-dot-kline{display:inline-block}
.tooltip-dot-placeholder{visibility:hidden}
.tooltip-dot.latest{background:#1d9bf0}
.tooltip-dot.avg{background:#f59e0b}
.tooltip-dot.rise{background:#56e788}
.tooltip-dot.dot-ma5{background:#5d7cf6}
.tooltip-dot.dot-ma10{background:#b8d72f}
.tooltip-dot.dot-ma20{background:#6d6ea6}
.tooltip-dot.dot-ma30{background:#ffa04a}
.chart-empty,.detail-empty{display:flex;align-items:center;justify-content:center;min-height:240px;color:rgba(255,255,255,.52);font-size:13px}
.detail-body::-webkit-scrollbar{display:none}
@media (max-width:1200px){.indices-strip{grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.stats-grid{grid-template-columns:repeat(4,minmax(0,1fr))}.minute-layout{gap:12px}.orderbook-panel{width:148px;flex-basis:148px;padding-left:12px}}
</style>
