<template>
  <section class="move-estimate" aria-label="异动测算">
    <header class="move-head">
      <div class="move-heading">
        <span class="move-sub">
          {{ estimate.boardLabel }} · 异动 {{ estimate.abnormalThresholdPercent }}% · 涨停 ±{{ estimate.limitPercent }}%
        </span>
        <span class="move-hint">
          连续 3 个交易日累计涨跌幅达 ±{{ estimate.abnormalThresholdPercent }}% 触发异常波动；按当前价视作今日收盘，指数偏离以交易所口径为准
        </span>
      </div>
      <div class="move-quote">
        <strong class="move-quote-price" :class="quoteToneClass">{{ priceText }}</strong>
        <span class="move-quote-change" :class="quoteToneClass">{{ changeText }}</span>
      </div>
    </header>

    <div class="move-summary" :class="summaryTone">
      <span class="move-summary-main">{{ summaryText }}</span>
      <span class="move-summary-sub">{{ cumulativeText }}</span>
    </div>

    <div class="move-list" role="list">
      <div
        v-for="row in rows"
        :key="row.kind + '-' + row.date"
        class="move-row"
        :class="[row.kind, row.abnormalStatus]"
        role="listitem"
      >
        <div class="move-date">
          <span class="move-day">{{ row.date.slice(5) }}</span>
          <span class="move-weekday">{{ row.weekday }}</span>
          <span class="move-tag" :class="row.kind">{{ tagOf(row) }}</span>
        </div>

        <template v-if="row.kind === 'future'">
          <div class="move-block">
            <span class="move-label">异动触发</span>
            <strong class="move-pct" :class="abnormalTone(row)">{{ abnormalLead(row) }}</strong>
            <span class="move-meta">{{ abnormalMeta(row) }}</span>
          </div>
          <div class="move-block">
            <span class="move-label">涨停</span>
            <strong class="move-pct up">{{ formatPercent(row.limitUpPercent) }}</strong>
            <span class="move-meta">{{ formatPrice(row.limitUpPrice) }} · 昨收 {{ formatPrice(row.basePrice) }}</span>
          </div>
          <span class="move-badge" :class="row.abnormalStatus">{{ badgeOf(row) }}</span>
        </template>

        <template v-else>
          <div class="move-block">
            <span class="move-label">{{ row.kind === 'today' ? '最新' : '收盘' }}</span>
            <strong class="move-number">{{ formatPrice(row.price) }}</strong>
            <span class="move-meta">昨收 {{ formatPrice(row.basePrice) }}</span>
          </div>
          <div class="move-block">
            <span class="move-label">涨跌幅</span>
            <strong class="move-number" :class="toneOf(row.changePercent)">{{ formatPercent(row.changePercent) }}</strong>
            <span class="move-meta">
              {{ row.kind === 'today' ? '涨停 ' + formatPrice(row.limitUpPrice) + ' / 跌停 ' + formatPrice(row.limitDownPrice) : '实际收盘' }}
            </span>
          </div>
        </template>
      </div>

      <div v-if="rows.length === 0" class="move-empty">暂无可测算的行情</div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KlinePoint } from '../../api/stock'
import { buildMoveEstimate, type MoveEstimateRow } from '../../utils/moveEstimate'

const props = defineProps<{
  code: string
  name: string
  price: number
  changePercent: number
  prevClose: number
  dayPoints: readonly KlinePoint[]
  quoteTime?: string
}>()

const estimate = computed(() => buildMoveEstimate({
  code: props.code,
  name: props.name,
  price: props.price,
  changePercent: props.changePercent,
  prevClose: props.prevClose,
  dayPoints: props.dayPoints,
  quoteTime: props.quoteTime
}))

const rows = computed<MoveEstimateRow[]>(() => {
  const { today, future } = estimate.value
  // 第一行是今天，之后按交易日从前往后排列
  return [...(today ? [today] : []), ...future]
})

const quoteToneClass = computed(() => toneOf(props.changePercent))
const priceText = computed(() => Number.isFinite(props.price) && props.price > 0 ? props.price.toFixed(2) : '--')
const changeText = computed(() => formatPercent(props.changePercent))

const currentCumulative = computed(() => estimate.value.currentCumulative3d)
const inAbnormalWindow = computed(() => {
  const value = currentCumulative.value
  return value !== null && value >= estimate.value.abnormalThresholdPercent
})

const hasEnoughHistory = computed(() => estimate.value.future.some((row) => row.abnormalStatus !== 'unknown'))

const summaryText = computed(() => {
  const estimateValue = estimate.value
  if (!hasEnoughHistory.value) return 'K 线历史不足，暂无法判断异动'
  if (inAbnormalWindow.value) {
    const exitPrice = estimateValue.currentAbnormalPrice
    return exitPrice === null
      ? '现价已进入异动区间'
      : `已进入异动区间：收盘低于 ${exitPrice.toFixed(2)} 才退出`
  }
  if (estimateValue.daysToAbnormal !== null) {
    return `连续涨停第 ${estimateValue.daysToAbnormal} 个交易日触发异动`
  }
  return `未来 ${estimateValue.future.length} 个交易日涨停也不触发异动`
})

const summaryTone = computed(() => inAbnormalWindow.value ? 'warn' : '')

const cumulativeText = computed(() => {
  const value = currentCumulative.value
  const threshold = estimate.value.abnormalThresholdPercent
  if (value === null) return `异动阈值 3 日累计 +-${threshold}%`
  const gap = threshold - value
  return gap > 0
    ? `当前 3 日累计 ${formatPercent(value)}，距异动还差 ${gap.toFixed(2)} 个百分点`
    : `当前 3 日累计 ${formatPercent(value)}，已超过异动阈值`
})

function toneOf(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

function abnormalTone(row: MoveEstimateRow): string {
  if (row.abnormalStatus === 'already') return 'warn'
  if (row.abnormalStatus === 'reachable') return 'warn'
  return 'flat'
}

function formatPrice(value: number | null): string {
  return value === null || !Number.isFinite(value) || value <= 0 ? '--' : value.toFixed(2)
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

function abnormalLead(row: MoveEstimateRow): string {
  if (row.abnormalPrice === null) return '--'
  if (row.abnormalStatus === 'already') return formatPrice(row.abnormalPrice)
  return formatPercent(row.abnormalPercent)
}

function abnormalMeta(row: MoveEstimateRow): string {
  if (row.abnormalPrice === null) return '历史数据不足'
  if (row.abnormalStatus === 'already') return '维持异动价 · 跌破退出'
  return `触发价 ${formatPrice(row.abnormalPrice)}`
}

function badgeOf(row: MoveEstimateRow): string {
  if (row.abnormalStatus === 'already') return '异动中'
  if (row.abnormalStatus === 'reachable') return '涨停即触发'
  if (row.abnormalStatus === 'unreachable') return '涨停不触发'
  return ''
}

function tagOf(row: MoveEstimateRow): string {
  if (row.kind === 'today') return '最新'
  return row.kind === 'past' ? '实际' : '测算'
}
</script>

<style scoped>
.move-estimate{display:flex;flex-direction:column;gap:6px;height:100%;min-height:0;padding:2px 2px 4px}
.move-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:0 0 auto}
.move-heading{display:flex;flex-direction:column;gap:2px;min-width:0}
.move-sub{font-size:var(--fs-sm);font-weight:650;color:var(--text-secondary)}
.move-hint{font-size:9px;line-height:1.4;color:var(--text-muted)}
.move-quote{display:inline-flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums}
.move-quote-price{font-size:15px;font-weight:700}
.move-quote-change{font-size:var(--fs-sm);font-weight:650}
.up{color:var(--rise)}
.down{color:var(--fall)}
.flat{color:var(--text-secondary)}
.warn{color:var(--c-amber)}
.move-summary{display:flex;flex-wrap:wrap;align-items:baseline;gap:8px;flex:0 0 auto;padding:5px 8px;border-radius:var(--radius-xs);background:var(--surface-2)}
.move-summary.warn{background:var(--c-amber-soft)}
.move-summary-main{font-size:var(--fs-sm);font-weight:650;color:var(--text-primary)}
.move-summary.warn .move-summary-main{color:var(--c-amber)}
.move-summary-sub{font-size:9px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.move-list{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;padding-bottom:4px;scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent}
.move-list::-webkit-scrollbar{width:4px}
.move-list::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
.move-row{position:relative;display:grid;grid-template-columns:66px minmax(0,1fr) minmax(0,1fr);gap:2px 10px;padding:5px 2px;border-top:1px solid var(--divider-color)}
.move-row:first-child{border-top:none}
.move-row.today{background:var(--surface-2)}
.move-date{display:flex;flex-direction:column;gap:1px;min-width:0}
.move-day{font-size:var(--fs-sm);font-weight:650;color:var(--text-primary);font-variant-numeric:tabular-nums}
.move-weekday{font-size:9px;color:var(--text-muted)}
.move-tag{align-self:flex-start;margin-top:1px;padding:0 4px;border-radius:3px;font-size:8px;line-height:12px;font-weight:700}
.move-tag.past{color:var(--text-muted);background:var(--surface-2)}
.move-tag.today{color:var(--accent);background:var(--accent-soft)}
.move-tag.future{color:var(--c-amber);background:var(--c-amber-soft)}
.move-block{display:flex;flex-direction:column;gap:1px;min-width:0}
.move-label{font-size:9px;color:var(--text-muted)}
.move-number{font-size:var(--fs-sm);font-weight:650;font-variant-numeric:tabular-nums}
.move-pct{font-size:15px;line-height:1.1;font-weight:700;font-variant-numeric:tabular-nums}
.move-meta{font-size:9px;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.move-badge{position:absolute;right:0;top:2px;padding:0 4px;border-radius:3px;font-size:8px;line-height:13px;font-weight:700}
.move-badge.already{color:var(--rise);background:var(--rise-soft)}
.move-badge.reachable{color:var(--c-amber);background:var(--c-amber-soft)}
.move-badge.unreachable{color:var(--text-muted);background:var(--surface-2)}
.move-empty{padding:12px 0;text-align:center;font-size:var(--fs-sm);color:var(--text-muted)}
</style>
