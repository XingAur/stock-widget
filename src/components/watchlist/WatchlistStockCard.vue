<template>
  <div
    class="stock-card"
    :class="{
      selected,
      dragging,
      'drag-over': dragOver,
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
      class="drag-handle"
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

    <div class="stock-main">
      <div class="stock-info">
        <div class="stock-name" :title="stock.name">{{ stock.name }}</div>
        <div class="stock-code">{{ stock.code }}</div>
      </div>
      <div v-if="showSparkline && prices.length >= 2" class="stock-sparkline-wrap">
        <WatchlistSparkline :prices="prices" :reference="stock.prevClose > 0 ? stock.prevClose : null" :tone="stock.changePercent >= 0 ? 'up' : 'down'" label="当日分时走势，虚线表示昨收价" />
      </div>
    </div>

    <div class="stock-side">
      <div class="change-pill" :class="changeTone">
        {{ changeText }}
      </div>
      <div class="stock-price">{{ stock.price.toFixed(2) }}</div>
    </div>

    <div v-if="hasPosition && metrics" class="position-strip" :class="toneClass">
      <span>成本 {{ formatMoney(metrics.costAmount) }}</span>
      <span>市值 {{ formatMoney(metrics.currentValue) }}</span>
      <strong>盈亏 {{ formatMoney(metrics.profit) }} / {{ formatPercent(metrics.profitPercent) }}</strong>
    </div>

    <button class="remove-btn" type="button" title="删除" @keydown.enter.stop @keydown.space.stop @click.stop="$emit('remove')">
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import WatchlistSparkline from './WatchlistSparkline.vue'
import type { Stock } from '../../api/stock'
import { useStockStore } from '../../stores/stock'
import { formatOptionalNumber, formatSignedOptionalPercent, getSignedChangeTone } from '../../utils/format'
import { calculateStockPositionMetrics, getProfitTone } from '../../utils/positions'

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
const toneClass = computed(() => 'position-' + getProfitTone(metrics.value?.profit ?? 0))
const changeText = computed(() => formatSignedOptionalPercent(props.stock.changePercent))
const changeTone = computed(() => getSignedChangeTone(props.stock.changePercent))

function formatMoney(value: number | undefined): string {
  return formatOptionalNumber(value, 2)
}

function formatPercent(value: number | undefined): string {
  return formatSignedOptionalPercent(value)
}
</script>

<style scoped>
.stock-card{position:relative;display:flex;align-items:center;gap:7px;width:100%;padding:6px 10px 6px 6px;border:1px solid transparent;border-radius:8px;background:rgba(255,255,255,.025);cursor:pointer;transition:transform .18s ease,background .18s ease,border-color .18s ease,opacity .18s ease,padding .18s ease;min-height:44px;text-align:left;color:inherit;outline:none}
.stock-card:hover{transform:translateX(2px);background:rgba(255,255,255,.05)}
.stock-card:focus-visible{border-color:rgba(93,168,255,.55)}
.stock-card:hover,.stock-card:focus-within,.stock-card.selected{padding-right:34px}
.stock-card.with-position{flex-wrap:wrap;align-items:flex-start;min-height:72px}
.stock-card.selected{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.085);box-shadow:inset 0 1px 0 rgba(255,255,255,.03)}
.stock-card.selected::before{content:'';position:absolute;inset:6px auto 6px 0;width:3px;border-radius:999px;background:linear-gradient(180deg,#5da8ff,#2d7cf6)}
.stock-card.dragging{opacity:.55;transform:scale(.99);cursor:grabbing}
.stock-card.drag-over{border-color:rgba(45,156,255,.62);background:rgba(45,156,255,.10)}
.drag-handle{width:22px;height:30px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:0 0 22px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:grab;touch-action:none}
.drag-handle span{width:12px;height:2px;border-radius:999px;background:currentColor}
.drag-handle:hover{color:var(--text-primary);background:rgba(255,255,255,.055)}
.stock-main{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.stock-info{display:flex;flex-direction:column;gap:2px;min-width:0;flex-shrink:0}
.stock-name{font-size:13px;font-weight:700;line-height:1.05;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:116px}
.stock-code{font-size:11px;color:var(--text-muted)}
.stock-sparkline-wrap{min-width:0;flex:1;height:24px;max-width:110px;overflow:hidden}
.stock-sparkline{display:block;width:100%;height:100%}
.stock-sparkline-line{fill:none;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.92}
.stock-sparkline-line.up{stroke:#ff7b7b}
.stock-sparkline-line.down{stroke:#39cf84}
.stock-side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}
.change-pill{display:inline-flex;align-items:center;justify-content:center;min-width:64px;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:700}
.change-pill.up{color:#ff7474;background:rgba(239,68,68,.14)}.change-pill.down{color:#3ad283;background:rgba(34,197,94,.12)}
.stock-price{font-size:13px;line-height:1;font-weight:500;color:var(--text-secondary)}
.position-strip{flex:1 0 calc(100% - 29px);margin-left:29px;margin-top:2px;display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.035);font-size:10px;line-height:1.2;color:var(--text-muted)}
.position-strip strong{grid-column:1 / -1;font-size:11px;font-weight:800;color:var(--text-secondary)}
.position-strip.position-profit strong{color:#ff7474}
.position-strip.position-loss strong{color:#3ad283}
.position-strip.position-flat strong{color:var(--text-muted)}
.remove-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:rgba(239,68,68,.12);color:#fca5a5;cursor:pointer;opacity:0;pointer-events:none}
.stock-card:hover .remove-btn,.stock-card:focus-within .remove-btn,.stock-card.selected .remove-btn{opacity:1;pointer-events:auto}
.remove-btn:hover{background:rgba(239,68,68,.22)}
</style>
