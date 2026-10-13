<template>
  <div
    class="cl-card cl-card--tall stock-card fund-card"
    :class="{
      'is-selected': selected,
      'is-dragging': dragging,
      'is-drop-target': dragOver,
      'with-position': hasPosition
    }"
    role="button"
    tabindex="0"
    data-drag-card="true"
    data-asset-type="fund"
    :data-index="index"
    @click.stop="$emit('open')"
    @keydown.enter.prevent="$emit('open')"
    @keydown.space.prevent="$emit('open')"
    @mouseenter="$emit('hover')"
    @mouseleave="$emit('leave')"
    @pointerenter="$emit('drag-enter')"
    @contextmenu.prevent.stop="$emit('contextmenu', $event)"
  >
    <button class="cl-card__handle drag-handle" type="button" title="拖动排序" @keydown.enter.stop @keydown.space.stop @click.stop @pointerdown.stop.prevent="$emit('start-drag', $event)">
      <span></span><span></span><span></span>
    </button>
    <div class="cl-card__main cl-card__main--stack fund-main-list">
      <div class="cl-card__title fund-title" :title="fund.name">{{ fund.name }}</div>
      <div class="cl-card__row fund-code-line">
        <span class="cl-card__sub stock-code">{{ fund.code }}</span>
        <div v-if="showSparkline && historyPrices.length >= 2" class="cl-card__chart fund-sparkline">
          <WatchlistSparkline :prices="historyPrices" :reference="historyPrices[0]" :tone="historyPrices[historyPrices.length - 1] >= historyPrices[0] ? 'up' : 'down'" label="近20个交易日净值走势，虚线表示区间首日净值；右侧涨幅为当日涨幅" />
        </div>
      </div>
    </div>
    <div class="cl-card__side fund-quote-side">
      <div class="cl-card__figure fund-change-value" :class="figureClass">{{ changeText }}</div>
      <div class="cl-card__value cl-card__value--sm fund-estimate-value">{{ navText }}</div>
      <div class="cl-card__meta fund-quote-meta" :class="{ 'is-estimate': quote.source === 'estimate' }">{{ meta }}</div>
    </div>
    <div v-if="hasPosition && metrics" class="cl-card__strip position-strip" :class="stripClass">
      <span>持有 {{ formatMoney(metrics.currentValue) }}</span>
      <span>成本 {{ formatMoney(metrics.costAmount) }}</span>
      <strong>盈亏 {{ formatMoney(metrics.profit) }} / {{ formatPercent(metrics.profitPercent) }}</strong>
    </div>
    <button class="cl-card__remove remove-btn" type="button" title="删除" @keydown.enter.stop @keydown.space.stop @click.stop="$emit('remove')">
      <X aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchFundHistory, type FundNavPoint, type FundQuote } from '../../api/stock'
import { readFundDetailCache, shouldRefreshFundHistory, writeFundDetailCache } from '../../utils/fundCache'
import { X } from 'lucide-vue-next'
import WatchlistSparkline from './WatchlistSparkline.vue'
import { formatOptionalNumber, formatSignedOptionalPercent, getSignedChangeTone } from '../../utils/format'
import { getProfitTone, type PositionMetrics } from '../../utils/positions'
import type { FundDisplayQuote } from '../../utils/fundQuote'
import { changeToneToTrend, profitToneToTrend } from '../../utils/tone'

const props = defineProps<{
  fund: FundQuote
  index: number
  selected: boolean
  dragging: boolean
  dragOver: boolean
  hasPosition: boolean
  showSparkline: boolean
  quote: FundDisplayQuote
  meta: string
  metrics: PositionMetrics | null
}>()

defineEmits<{
  open: []
  hover: []
  leave: []
  'drag-enter': []
  contextmenu: [event: MouseEvent]
  'start-drag': [event: PointerEvent]
  remove: []
}>()

const figureClass = computed(() => {
  const trend = changeToneToTrend(getSignedChangeTone(props.quote.changePercent))
  return trend ? `cl-${trend}` : ''
})
const changeText = computed(() => formatSignedOptionalPercent(props.quote.changePercent))
const navText = computed(() => formatOptionalNumber(props.quote.nav, 4))
const stripClass = computed(() => 'is-' + profitToneToTrend(getProfitTone(props.metrics?.profit ?? 0)))
const history = ref<FundNavPoint[]>([])
const historyPrices = computed(() => [...history.value]
  .filter((point) => Number.isFinite(point.nav) && point.nav > 0)
  .sort((left, right) => left.date.localeCompare(right.date))
  .slice(-21)
  .map((point) => point.nav))
let historyRequest = 0
watch(() => [props.fund.code, props.fund.navDate, props.showSparkline], async () => {
  const request = ++historyRequest
  if (!props.showSparkline) return
  const code = props.fund.code
  const cache = readFundDetailCache<FundNavPoint[]>('history-v2', code, 6 * 60 * 60 * 1000)
  history.value = cache?.value ?? []
  if (!shouldRefreshFundHistory(cache, props.fund.navDate)) return
  try {
    const points = await fetchFundHistory(code)
    if (request !== historyRequest) return
    history.value = points
    if (points.length > 0) writeFundDetailCache('history-v2', code, points)
  } catch {
    // 历史净值不可用时保留已有真实缓存，不影响列表行情。
  }
}, { immediate: true })

function formatMoney(value: number | undefined): string {
  return formatOptionalNumber(value, 2)
}

function formatPercent(value: number | undefined): string {
  return formatSignedOptionalPercent(value)
}
</script>
