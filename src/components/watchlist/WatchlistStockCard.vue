<template>
  <div
    class="cl-card stock-card"
    :class="{
      'is-selected': selected,
      'is-dragging': dragging,
      'is-drop-target': dragOver,
      'with-position': hasPosition
    }"
    role="button"
    tabindex="0"
    :title="'打开 ' + stock.name + ' 详情'"
    data-drag-card="true"
    data-asset-type="stock"
    :data-index="index"
    @click.stop="$emit('open')"
    @keydown.enter.prevent="$emit('open')"
    @keydown.space.prevent="$emit('open')"
    @mouseenter="$emit('hover')"
    @mouseleave="$emit('leave')"
    @pointerenter="$emit('drag-enter')"
    @contextmenu.prevent.stop="$emit('contextmenu', $event)"
  >
    <button
      class="cl-card__handle drag-handle"
      type="button"
      title="拖动排序"
      @click.stop
      @keydown.enter.stop
      @keydown.space.stop
      @pointerdown.stop.prevent="$emit('start-drag', $event)"
    >
      <span></span>
      <span></span>
      <span></span>
    </button>

    <div class="cl-card__main stock-main">
      <div class="cl-card__info stock-info">
        <div class="cl-card__title stock-name" :title="stock.name">{{ stock.name }}</div>
        <div class="cl-card__sub stock-code">{{ stock.code }}</div>
      </div>
      <div v-if="showSparkline && prices.length >= 2" class="cl-card__chart stock-sparkline-wrap">
        <WatchlistSparkline :prices="prices" :reference="stock.prevClose > 0 ? stock.prevClose : null" :tone="stock.changePercent >= 0 ? 'up' : 'down'" label="当日分时走势，虚线表示昨收价" />
      </div>
    </div>

    <div class="cl-card__side stock-side">
      <div class="cl-pill change-pill" :class="pillClass">
        {{ changeText }}
      </div>
      <div class="cl-card__value stock-price">{{ stock.price.toFixed(2) }}</div>
    </div>

    <div v-if="hasPosition && metrics" class="cl-card__strip position-strip" :class="stripClass">
      <span>成本 {{ formatMoney(metrics.costAmount) }}</span>
      <span>市值 {{ formatMoney(metrics.currentValue) }}</span>
      <strong>盈亏 {{ formatMoney(metrics.profit) }} / {{ formatPercent(metrics.profitPercent) }}</strong>
    </div>

    <button class="cl-card__remove remove-btn" type="button" title="删除" @keydown.enter.stop @keydown.space.stop @click.stop="$emit('remove')">
      <X aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import WatchlistSparkline from './WatchlistSparkline.vue'
import type { Stock } from '../../api/stock'
import { useStockStore } from '../../stores/stock'
import { formatOptionalNumber, formatSignedOptionalPercent, getSignedChangeTone } from '../../utils/format'
import { calculateStockPositionMetrics, getProfitTone } from '../../utils/positions'
import { changeToneToTrend, profitToneToTrend } from '../../utils/tone'

const props = defineProps<{
  stock: Stock
  index: number
  selected: boolean
  dragging: boolean
  dragOver: boolean
  showSparkline: boolean
  prices: readonly number[]
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

const stockStore = useStockStore()
const metrics = computed(() => calculateStockPositionMetrics(stockStore.stockPositions[props.stock.code], props.stock.price))
const hasPosition = computed(() => props.selected && Boolean(metrics.value))
const stripClass = computed(() => 'is-' + profitToneToTrend(getProfitTone(metrics.value?.profit ?? 0)))
const changeText = computed(() => formatSignedOptionalPercent(props.stock.changePercent))
const pillClass = computed(() => {
  const trend = changeToneToTrend(getSignedChangeTone(props.stock.changePercent))
  return trend ? `cl-pill--${trend}` : ''
})

function formatMoney(value: number | undefined): string {
  return formatOptionalNumber(value, 2)
}

function formatPercent(value: number | undefined): string {
  return formatSignedOptionalPercent(value)
}
</script>
