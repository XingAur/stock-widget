<template>
  <div class="detail-view">
    <!-- Header: name left, price right -->
    <header class="detail-header">
      <button class="back-btn" @click="$emit('back')">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>
      <div class="header-info">
        <span class="stock-name">{{ detail?.name }}</span>
        <span class="stock-code">{{ code }}</span>
      </div>
      <div class="header-price" v-if="detail?.price != null">
        <span class="price-value">{{ detail.price.toFixed(2) }}</span>
        <span class="price-change" :class="{ up: (detail?.changePercent ?? 0) >= 0, down: (detail?.changePercent ?? 0) < 0 }">
          {{ (detail?.changePercent ?? 0) >= 0 ? '+' : '' }}{{ detail.changePercent.toFixed(2) }}%
        </span>
      </div>
    </header>

    <!-- Scrollable content -->
    <div class="scroll-content">
      <!-- Data grid -->
      <div class="data-grid">
        <div class="data-item">
          <span><span class="value">{{ detail?.high?.toFixed(2) ?? '--' }}</span></span>
          <span class="label">最高</span>
        </div>
        <div class="data-item">
          <span><span class="value">{{ detail?.open?.toFixed(2) ?? '--' }}</span></span>
          <span class="label">今开</span>
        </div>
        <div class="data-item">
          <span><span class="value">{{ formatVolume(detail?.volume)?.value ?? '--' }}</span><span class="unit">{{ formatVolume(detail?.volume)?.unit ?? '' }}</span></span>
          <span class="label">成交量</span>
        </div>
        <div class="data-item">
          <span><span class="value">{{ detail?.low?.toFixed(2) ?? '--' }}</span></span>
          <span class="label">最低</span>
        </div>
        <div class="data-item">
          <span><span class="value">{{ detail?.prevClose?.toFixed(2) ?? '--' }}</span></span>
          <span class="label">昨收</span>
        </div>
        <div class="data-item">
          <span><span class="value">{{ formatAmount(detail?.amount)?.value ?? '--' }}</span><span class="unit">{{ formatAmount(detail?.amount)?.unit ?? '' }}</span></span>
          <span class="label">成交额</span>
        </div>
      </div>

      <!-- Market cap -->
      <div class="data-grid market-cap-grid">
        <div class="data-item">
          <span><span class="value">{{ formatMarketCap(detail?.totalMarketCap)?.value ?? '--' }}</span><span class="unit">{{ formatMarketCap(detail?.totalMarketCap)?.unit ?? '' }}</span></span>
          <span class="label">总市值</span>
        </div>
        <div class="data-item">
          <span><span class="value">{{ formatMarketCap(detail?.circulationMarketCap)?.value ?? '--' }}</span><span class="unit">{{ formatMarketCap(detail?.circulationMarketCap)?.unit ?? '' }}</span></span>
          <span class="label">流通市值</span>
        </div>
      </div>

      <!-- Tab bar -->
      <div class="tab-bar">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab-btn"
          :class="{ active: activeTab === tab.key }"
          @click="switchTab(tab.key)"
        >{{ tab.label }}</button>
      </div>

      <!-- Chart -->
      <div class="chart-section" ref="chartRef">
        <div v-show="loading" class="chart-loading">加载中...</div>
      </div>
    </div>

    <!-- Footer -->
    <div class="footer">
      <button class="refresh-btn" @click="refreshDetail" :class="{ spinning: loading }">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10"></polyline>
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
        </svg>
        <span>更新于 {{ lastUpdate ? formatTime(lastUpdate) : '--:--:--' }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { useSettingsStore } from '../stores/settings'
import {
  fetchStockDetail,
  fetchKlineData,
  type KlineData,
  type MinuteData
} from '../api/stock'

const settingsStore = useSettingsStore()

const props = defineProps<{
  code: string
}>()

defineEmits<{
  back: []
}>()

type TabKey = 'minute' | 'day' | 'week' | 'month' | 'quarter' | 'year'

interface TabItem {
  key: TabKey
  label: string
  paramType: string
}

const tabs: TabItem[] = [
  { key: 'minute', label: '分时', paramType: '' },
  { key: 'day', label: '日K', paramType: 'day' },
  { key: 'week', label: '周K', paramType: 'week' },
  { key: 'month', label: '月K', paramType: 'month' },
  { key: 'quarter', label: '季K', paramType: 'quarter' },
  { key: 'year', label: '年K', paramType: 'year' },
]

const detail = ref<any>(null)
const loading = ref(true)
const activeTab = ref<TabKey>('minute')
const chartRef = ref<HTMLElement>()
let chartInstance: echarts.ECharts | null = null
let resizeObserver: ResizeObserver | null = null
const lastUpdate = ref<Date | null>(null)
let autoRefreshTimer: number | null = null

// Re-render chart when theme changes
watch(() => settingsStore.settings.theme, () => {
  renderChart()
})

function formatTime(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`
}

function getChartColors() {
  const isDark = settingsStore.settings.theme === 'dark'
  return {
    axisLabel: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)',
    axisLine: isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.1)',
    splitLine: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)',
    loadingText: isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.3)',
    volumeBar: isDark ? 'rgba(100,100,100,0.25)' : 'rgba(100,100,100,0.2)',
    legendText: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(0,0,0,0.45)',
  }
}

function formatMarketCap(val: number | undefined): { value: string; unit: string } {
  if (!val) return { value: '--', unit: '' }
  if (val >= 1) return { value: val.toFixed(2), unit: '亿' }
  if (val >= 0.01) return { value: (val * 1e4).toFixed(2), unit: '万' }
  return { value: '--', unit: '' }
}

function formatVolume(volume: number | undefined): { value: string; unit: string } {
  if (!volume) return { value: '--', unit: '' }
  if (volume >= 1e8) return { value: (volume / 1e8).toFixed(2), unit: '亿手' }
  if (volume >= 1e4) return { value: (volume / 1e4).toFixed(2), unit: '万手' }
  return { value: String(volume), unit: '手' }
}

function formatAmount(amount: number | undefined): { value: string; unit: string } {
  if (!amount) return { value: '--', unit: '' }
  if (amount >= 1e8) return { value: (amount / 1e8).toFixed(2), unit: '亿' }
  if (amount >= 1e4) return { value: (amount / 1e4).toFixed(2), unit: '万' }
  return { value: amount.toFixed(0), unit: '元' }
}

async function loadDetail() {
  loading.value = true
  const data = await fetchStockDetail(props.code)
  detail.value = data
  lastUpdate.value = new Date()
  loading.value = false
  renderChart()
}

async function refreshDetail() {
  loading.value = true
  if (activeTab.value === 'minute') {
    const data = await fetchStockDetail(props.code)
    detail.value = data
  } else {
    const tab = tabs.find(t => t.key === activeTab.value)!
    const kline = await fetchKlineData(props.code, tab.paramType)
    detail.value = detail.value ? { ...detail.value, kline } : null
  }
  lastUpdate.value = new Date()
  loading.value = false
  renderChart()
}

async function switchTab(key: TabKey) {
  activeTab.value = key
  loading.value = true
  if (key === 'minute') {
    const data = await fetchStockDetail(props.code)
    detail.value = data
  } else {
    const tab = tabs.find(t => t.key === key)!
    const kline = await fetchKlineData(props.code, tab.paramType)
    detail.value = detail.value ? { ...detail.value, kline } : null
  }
  loading.value = false
  renderChart()
}

function renderChart() {
  if (!chartRef.value) return

  if (chartInstance) {
    chartInstance.dispose()
  }

  if (activeTab.value === 'minute') {
    renderMinuteChart(detail.value?.minute ?? [])
  } else {
    renderKlineChart(detail.value?.kline ?? [])
  }
}

function renderMinuteChart(data: MinuteData[]) {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)

  if (data.length === 0) {
    const colors = getChartColors()
    chartInstance.setOption({
      graphic: [{
        type: 'text',
        left: 'center',
        top: 'center',
        style: { text: '暂无分时数据', fill: colors.loadingText, fontSize: 14 }
      }]
    })
    return
  }

  let totalAmount = 0
  let totalVolume = 0
  const avgPrices: number[] = []
  for (const d of data) {
    totalAmount += d.price * d.volume
    totalVolume += d.volume
    avgPrices.push(totalVolume > 0 ? totalAmount / totalVolume : d.price)
  }

  const times = data.map(d => d.time)
  const prices = data.map(d => d.price)
  const colors = getChartColors()

  const option: echarts.EChartsOption = {
    animation: false,
    axisPointer: {
      type: 'cross',
      label: { show: false }
    },
     tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: { show: false }
      },
      formatter: (params: any) => {
        const p = params[0]
        return `${p.axisValue}<br/>最新: ${p.value[1]}<br/>均价: ${avgPrices[p.dataIndex].toFixed(2)}`
      }
    },
    grid: [
      { left: 45, right: 15, top: 8, bottom: 46 }
    ],
    xAxis: [
      {
        type: 'category',
        data: times,
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.axisLine } },
        axisTick: { show: false },
        axisLabel: { color: colors.axisLabel, fontSize: 9 }
      }
    ],
    yAxis: [
      {
        type: 'value',
        min: (v: any) => Math.floor(v.min * 100) / 100,
        max: (v: any) => Math.ceil(v.max * 100) / 100,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: colors.axisLabel, fontSize: 9 },
        splitLine: { lineStyle: { color: colors.splitLine } },
        axisPointer: {
          show: true,
          label: {
            show: false,
            backgroundColor: 'transparent',
            borderColor: 'transparent'
          }
        }
      }
    ],
    legend: {
      data: ['最新', '均价'],
      bottom: 2,
      padding: 0,
      textStyle: { color: colors.legendText, fontSize: 9 },
      itemWidth: 10,
      itemHeight: 2
    },
    series: [
      {
        name: '最新',
        type: 'line',
        data: prices.map((p, i) => [times[i], p]),
        smooth: 0.1,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 1.5 },
        areaStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: 'rgba(59,130,246,0.25)' },
            { offset: 1, color: 'rgba(59,130,246,0.02)' }
          ])
        }
      },
      {
        name: '均价',
        type: 'line',
        data: avgPrices,
        smooth: 0.1,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 1 }
      }
    ]
  }

  chartInstance.setOption(option)
}

function renderKlineChart(data: KlineData[]) {
  if (!chartRef.value) return
  chartInstance = echarts.init(chartRef.value)

  if (data.length === 0) {
    const colors = getChartColors()
    chartInstance.setOption({
      graphic: [{
        type: 'text',
        left: 'center',
        top: 'center',
        style: { text: '暂无K线数据', fill: colors.loadingText, fontSize: 14 }
      }]
    })
    return
  }

  const dates = data.map(item => item.time)
  const values = data.map(item => [item.open, item.close, item.low, item.high])
  const closes = data.map(item => item.close)

  function calcMA(period: number): number[] {
    return closes.map((_, i) => {
      if (i < period - 1) return NaN
      let sum = 0
      for (let j = i - period + 1; j <= i; j++) sum += closes[j]
      return sum / period
    })
  }

  const ma5 = calcMA(5)
  const ma10 = calcMA(10)
  const ma20 = calcMA(20)
  const ma30 = calcMA(30)

  const colors = getChartColors()

  const option: echarts.EChartsOption = {
    animation: false,
    axisPointer: {
      label: { show: false }
    },
    tooltip: {
      trigger: 'axis',
      axisPointer: {
        type: 'cross',
        label: { show: false }
      }
    },
    grid: [
      { left: 45, right: 15, top: 8, bottom: 48 }
    ],
    xAxis: [
      {
        type: 'category',
        data: dates,
        boundaryGap: false,
        axisLine: { lineStyle: { color: colors.axisLine } },
        axisTick: { show: false },
        axisLabel: { color: colors.axisLabel, fontSize: 9 }
      }
    ],
    yAxis: [
      {
        scale: true,
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: colors.axisLabel, fontSize: 9 },
        splitLine: { lineStyle: { color: colors.splitLine } }
      }
    ],
    legend: {
      data: ['MA5', 'MA10', 'MA20', 'MA30'],
      bottom: 2,
      textStyle: { color: colors.legendText, fontSize: 9 },
      itemWidth: 8,
      itemHeight: 2
    },
    series: [
      {
        type: 'candlestick',
        data: values,
        itemStyle: {
          color: '#22c55e',
          color0: '#ef4444',
          borderColor: '#22c55e',
          borderColor0: '#ef4444'
        }
      },
      {
        name: 'MA5',
        type: 'line',
        data: ma5,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#5b8cff', width: 1 }
      },
      {
        name: 'MA10',
        type: 'line',
        data: ma10,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#fbbf24', width: 1 }
      },
      {
        name: 'MA20',
        type: 'line',
        data: ma20,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#a78bfa', width: 1 }
      },
      {
        name: 'MA30',
        type: 'line',
        data: ma30,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f59e0b', width: 1 }
      }
    ]
  }

  chartInstance.setOption(option)
}

onMounted(() => {
  loadDetail()

  // Resize chart when container size changes
  if (chartRef.value) {
    resizeObserver = new ResizeObserver(() => {
      if (chartInstance) {
        chartInstance.resize()
      }
    })
    resizeObserver.observe(chartRef.value)
  }

  // Auto-refresh every 30s
  autoRefreshTimer = window.setInterval(() => {
    refreshDetail()
  }, 30000)
})

onUnmounted(() => {
  if (chartInstance) {
    chartInstance.dispose()
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  if (autoRefreshTimer) {
    clearInterval(autoRefreshTimer)
  }
})
</script>

<style scoped>
.detail-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.scroll-content {
  flex: 1;
  overflow-y: auto;
}

.scroll-content::-webkit-scrollbar {
  display: none;
}

.scroll-content {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

/* Header */
.detail-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  flex-shrink: 0;
}

.back-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--radius-sm);
  transition: all 0.15s;
  flex-shrink: 0;
}

.back-btn:hover {
  background: var(--card-bg-hover);
  color: var(--text-primary);
}

.header-info {
  flex: 1;
  min-width: 0;
}

.stock-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
}

.stock-code {
  font-size: 12px;
  color: var(--text-muted);
  margin-left: 4px;
}

.header-price {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.price-value {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.price-change {
  font-size: 13px;
  font-weight: 500;
  padding: 2px 6px;
  border-radius: 3px;
  color: #fff;
}

.price-change.up {
  background: var(--success);
}

.price-change.down {
  background: var(--danger);
}

/* Data grid */
.data-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  padding: 8px 16px 4px;
  flex-shrink: 0;
}

.data-item {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  padding: 4px 0 4px 12px;
}

.data-item .label {
  font-size: 11px;
  color: var(--text-muted);
}

.data-item .value {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.data-item .unit {
  font-size: 11px;
  font-weight: 400;
  color: var(--text-muted);
}

.data-grid.market-cap-grid {
  padding-top: 0;
}

/* Tab bar */
.tab-bar {
  display: flex;
  gap: 0;
  padding: 0 8px;
  border-bottom: 1px solid var(--border-color);
  margin-bottom: 0;
  flex-shrink: 0;
  white-space: nowrap;
  overflow-x: auto;
}

.tab-bar::-webkit-scrollbar {
  display: none;
}

.tab-bar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

.tab-btn {
  padding: 6px 8px;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  position: relative;
  transition: color 0.15s;
}

.tab-btn:hover {
  color: var(--text-primary);
}

.tab-btn.active {
  color: var(--accent);
  background: transparent;
}

.tab-btn.active::after {
  content: '';
  position: absolute;
  bottom: -1px;
  left: 50%;
  transform: translateX(-50%);
  width: 20px;
  height: 2px;
  background: var(--accent);
  border-radius: 1px;
}

/* Chart */
.chart-section {
  height: 200px;
  position: relative;
  flex-shrink: 0;
}

.chart-loading {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: var(--text-muted);
  font-size: 13px;
}

/* Footer */
.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  flex-shrink: 0;
}

.refresh-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 12px;
  cursor: pointer;
  padding: 4px 0;
  transition: color 0.15s;
}

.refresh-btn:hover {
  color: var(--text-primary);
}

.refresh-btn.spinning svg {
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
