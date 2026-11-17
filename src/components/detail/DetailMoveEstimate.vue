<template>
  <section class="move-estimate" aria-label="异动测算">
    <header class="move-head">
      <div class="move-heading">
        <span class="move-sub">{{ estimate.profile.label }} · {{ estimate.profile.indexName }} · 涨停 ±{{ limitPercent }}%</span>
        <span class="move-hint">指数按最新点位不变、前日按不触发最高价推演；两条偏离规则分别模拟，同向次数另计</span>
      </div>
      <div class="move-quote">
        <strong class="move-quote-price" :class="quoteToneClass">{{ priceText }}</strong>
        <span class="move-quote-change" :class="quoteToneClass">{{ changeText }}</span>
      </div>
    </header>

    <div class="move-summary" :class="{ warn: estimate.today.triggered }">
      <span class="move-summary-main">{{ todayBadge }}</span>
      <span class="move-summary-sub">{{ estimate.today.date }} · 10 日 +100% / -50% · 30 日 +200% / -70%</span>
      <span class="move-summary-sub" :class="{ warn: sameDirectionReached }">{{ sameDirectionText }}</span>
    </div>

    <div class="move-table">
      <div class="move-table-head">
        <span class="move-col-date">T+N 日期</span>
        <span class="move-col-rule">100% 规则</span>
        <span class="move-col-rule">200% 规则</span>
      </div>
      <div class="move-list" role="list">
        <div v-for="(row, rowIndex) in estimate.rows" :key="row.date" class="move-row" role="listitem">
          <div class="move-date">
            <span class="move-day">{{ rowIndex + 1 }}</span>
            <span class="move-date-main">{{ row.date }}</span>
            <span class="move-weekday">{{ row.weekday }}</span>
            <span v-if="row.sameDirectionEvent" class="move-abn-tag" :class="row.sameDirectionEvent">同向 {{ row.sameDirectionEvent === 'up' ? '+' : '-' }}1</span>
          </div>
          <div
            v-for="(cell, cellIndex) in row.cells"
            :key="cellIndex"
            class="move-cell"
            :class="cell.kind"
          >
            <span class="move-cell-label">{{ cellLabel(cell) }}</span>
            <strong class="move-pct" :class="cell.kind === 'trigger' ? 'warn' : 'up'">{{ formatPercent(cell.percent) }}</strong>
            <span class="move-meta">{{ priceLabel(cell) }}</span>
            <span class="move-meta">模拟昨收 {{ formatPrice(cell.prevClose) }}</span>
            <span class="move-badge" :class="cell.kind">{{ cell.badge }}</span>
          </div>
        </div>
        <div v-if="estimate.rows.length === 0" class="move-empty">暂无可测算的行情</div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { KlinePoint } from '../../api/stock'
import { buildSevereEstimate, type SevereCell } from '../../utils/moveEstimate'

const props = defineProps<{
  code: string
  name: string
  price: number
  changePercent: number
  prevClose: number
  dayPoints: readonly KlinePoint[]
  indexPoints: readonly KlinePoint[]
  quoteTime?: string
}>()

const estimate = computed(() => buildSevereEstimate({
  code: props.code,
  name: props.name,
  price: props.price,
  prevClose: props.prevClose,
  dayPoints: props.dayPoints,
  indexPoints: props.indexPoints,
  quoteTime: props.quoteTime
}))

const limitPercent = computed(() => Number((estimate.value.profile.limitRatio * 100).toFixed(0)))
const quoteToneClass = computed(() => toneOf(props.changePercent))
const priceText = computed(() => Number.isFinite(props.price) && props.price > 0 ? props.price.toFixed(2) : '--')
const changeText = computed(() => formatPercent(props.changePercent))
const sameDirectionReached = computed(() => estimate.value.sameDirection.reached)
const sameDirectionText = computed(() => {
  const status = estimate.value.sameDirection
  const parts = [
    `近 10 日同向异动：↑${status.up} / ↓${status.down}（上限 ${status.limit} 次）`
  ]
  if (status.reached) parts.push('已达上限，触发严重异动')
  else if (status.projectedTriggerDay !== null && status.projectedTriggerDay > 0) parts.push(`连续涨停第 ${status.projectedTriggerDay} 天达上限`)
  return parts.join(' · ')
})

const todayBadge = computed(() => {
  if (!estimate.value.indexReady) return '基准指数数据缺失，暂无法测算'
  const triggered = estimate.value.today.badges.filter((badge) => badge.includes('触发') && !badge.includes('不触发'))
  if (triggered.length > 0) return '今日涨停会触发' + triggered[0].replace('今日涨停', '')
  return '今日涨停不触发严重异动'
})

function toneOf(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

function formatPrice(value: number | null): string {
  return value === null || !Number.isFinite(value) || value <= 0 ? '--' : value.toFixed(2)
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  return (value > 0 ? '+' : '') + value.toFixed(2) + '%'
}

function cellLabel(cell: SevereCell): string {
  if (cell.kind === 'trigger') return '首次触发涨幅'
  if (cell.kind === 'limit') return '涨停涨幅'
  return '数据不足'
}

function priceLabel(cell: SevereCell): string {
  if (cell.kind === 'trigger') return '触发价 ' + formatPrice(cell.price)
  if (cell.kind === 'limit') return '涨停价 ' + formatPrice(cell.price)
  return ''
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
.move-table{display:flex;flex-direction:column;flex:1 1 auto;min-height:0}
.move-table-head{display:grid;grid-template-columns:96px minmax(0,1fr) minmax(0,1fr);gap:8px;flex:0 0 auto;padding:2px 2px 4px;border-bottom:1px solid var(--divider-color);font-size:9px;color:var(--text-muted);font-weight:700}
.move-list{display:flex;flex-direction:column;flex:1 1 auto;min-height:0;overflow-y:auto;padding-bottom:4px;scrollbar-width:thin;scrollbar-color:var(--border-strong) transparent}
.move-list::-webkit-scrollbar{width:4px}
.move-list::-webkit-scrollbar-thumb{background:var(--border-strong);border-radius:2px}
.move-row{display:grid;grid-template-columns:96px minmax(0,1fr) minmax(0,1fr);gap:8px;padding:6px 2px;border-top:1px solid var(--divider-color)}
.move-row:first-child{border-top:none}
.move-date{display:flex;flex-direction:column;gap:1px;min-width:0}
.move-day{font-size:var(--fs-sm);font-weight:650;color:var(--text-primary)}
.move-date-main{font-size:10px;color:var(--text-secondary);font-variant-numeric:tabular-nums}
.move-weekday{font-size:9px;color:var(--text-muted)}
.move-abn-tag{align-self:flex-start;margin-top:2px;padding:0 4px;border-radius:999px;font-size:8px;line-height:13px;font-weight:700;background:var(--c-amber-soft);color:var(--c-amber)}
.move-cell{display:flex;flex-direction:column;gap:1px;min-width:0}
.move-cell-label{font-size:9px;color:var(--text-muted)}
.move-pct{font-size:15px;line-height:1.15;font-weight:700;font-variant-numeric:tabular-nums}
.move-meta{font-size:9px;color:var(--text-muted);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.move-badge{align-self:flex-start;margin-top:2px;padding:0 5px;border-radius:999px;font-size:8px;line-height:13px;font-weight:700}
.move-badge.limit{color:var(--fall);background:var(--fall-soft)}
.move-badge.trigger{color:var(--rise);background:var(--rise-soft)}
.move-badge.unknown{color:var(--text-muted);background:var(--surface-2)}
.move-empty{padding:12px 0;text-align:center;font-size:var(--fs-sm);color:var(--text-muted)}
</style>
