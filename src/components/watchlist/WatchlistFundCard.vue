<template>
  <div
    class="stock-card fund-card"
    :class="{
      selected,
      dragging,
      'drag-over': dragOver,
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
    <button class="drag-handle" type="button" title="拖动排序" @keydown.enter.stop @keydown.space.stop @click.stop @pointerdown.stop.prevent="$emit('start-drag', $event)">
      <span></span><span></span><span></span>
    </button>
    <div class="fund-main-list">
      <div class="fund-title" :title="fund.name">{{ fund.name }}</div>
      <div class="fund-code-line">
        <span class="stock-code">{{ fund.code }}</span>
        <WatchlistSparkline v-if="showSparkline && historyPrices.length >= 2" class="fund-sparkline" :prices="historyPrices" :reference="historyPrices[0]" :tone="historyPrices[historyPrices.length - 1] >= historyPrices[0] ? 'up' : 'down'" label="近20个交易日净值走势，虚线表示区间首日净值；右侧涨幅为当日涨幅" />
      </div>
    </div>
    <div class="fund-quote-side">
      <div class="fund-change-value" :class="changeTone">{{ changeText }}</div>
      <div class="fund-estimate-value">{{ navText }}</div>
      <div class="fund-quote-meta" :class="{ estimate: quote.source === 'estimate' }">{{ meta }}</div>
    </div>
    <div v-if="hasPosition && metrics" class="position-strip" :class="toneClass">
      <span>持有 {{ formatMoney(metrics.currentValue) }}</span>
      <span>成本 {{ formatMoney(metrics.costAmount) }}</span>
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
import { computed, ref, watch } from 'vue'
import { fetchFundHistory, type FundNavPoint, type FundQuote } from '../../api/stock'
import { readFundDetailCache, shouldRefreshFundHistory, writeFundDetailCache } from '../../utils/fundCache'
import WatchlistSparkline from './WatchlistSparkline.vue'
import { formatOptionalNumber, formatSignedOptionalPercent, getSignedChangeTone } from '../../utils/format'
import { getProfitTone, type PositionMetrics } from '../../utils/positions'
import type { FundDisplayQuote } from '../../utils/fundQuote'

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

const changeTone = computed(() => getSignedChangeTone(props.quote.changePercent))
const changeText = computed(() => formatSignedOptionalPercent(props.quote.changePercent))
const navText = computed(() => formatOptionalNumber(props.quote.nav, 4))
const toneClass = computed(() => 'position-' + getProfitTone(props.metrics?.profit ?? 0))
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

<style scoped>
.stock-card{position:relative;display:flex;align-items:center;gap:7px;width:100%;padding:6px 10px 6px 6px;border:1px solid transparent;border-radius:8px;background:rgba(255,255,255,.025);cursor:pointer;min-height:44px;text-align:left;color:inherit;outline:none}
.stock-card:focus-visible{border-color:rgba(93,168,255,.55)}
.stock-card:hover,.stock-card:focus-within,.stock-card.selected{padding-right:34px}
.stock-card.selected{border-color:rgba(255,255,255,.08);background:rgba(255,255,255,.085)}
.stock-card.selected::before{content:'';position:absolute;inset:6px auto 6px 0;width:3px;border-radius:999px;background:linear-gradient(180deg,#5da8ff,#2d7cf6)}
.stock-card.dragging{opacity:.55}
.stock-card.drag-over{border-color:rgba(45,156,255,.62);background:rgba(45,156,255,.10)}
.drag-handle{width:22px;height:30px;display:inline-flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;flex:0 0 22px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:grab;touch-action:none}
.drag-handle span{width:12px;height:2px;border-radius:999px;background:currentColor}
.stock-code{font-size:11px;color:var(--text-muted)}
.position-strip{flex:1 0 calc(100% - 29px);margin-left:29px;margin-top:2px;display:grid;grid-template-columns:1fr 1fr;gap:3px 8px;padding:6px 8px;border-radius:8px;background:rgba(255,255,255,.035);font-size:10px;color:var(--text-muted)}
.position-strip strong{grid-column:1 / -1;font-size:11px;font-weight:800}
.position-strip.position-profit strong{color:#ff7474}
.position-strip.position-loss strong{color:#3ad283}
.remove-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:6px;background:rgba(239,68,68,.12);color:#fca5a5;cursor:pointer;opacity:0;pointer-events:none}
.stock-card:hover .remove-btn,.stock-card:focus-within .remove-btn,.stock-card.selected .remove-btn{opacity:1;pointer-events:auto}
.fund-card{align-items:center;min-height:58px;cursor:pointer}
.fund-card:hover{transform:none}
.fund-card.with-position{align-items:flex-start;min-height:86px}
.fund-main-list{min-width:0;flex:1;display:flex;flex-direction:column;gap:6px;padding-top:1px}
.fund-title{max-width:176px;font-size:13px;font-weight:800;line-height:1.12;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fund-code-line{display:flex;align-items:center;gap:6px;min-width:0}
.fund-sparkline{flex:1;width:100%;max-width:120px;height:24px}
.fund-quote-side{margin-left:auto;display:flex;flex-direction:column;align-items:flex-end;gap:5px;min-width:72px;flex-shrink:0}
.fund-change-value{font-size:17px;font-weight:900;line-height:1}
.fund-change-value.up{color:#ff6868}.fund-change-value.down{color:#32ce7b}
.fund-estimate-value{font-size:12px;font-weight:700;line-height:1;color:#8f99bb}
.fund-quote-meta{font-size:8px;font-weight:650;line-height:1;color:var(--text-muted);white-space:nowrap}
.fund-quote-meta.estimate{color:#f0a35b}
</style>
