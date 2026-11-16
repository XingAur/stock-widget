<template>
  <section class="cl-panel move-estimate" aria-label="异动测算">
    <header class="move-head">
      <div class="move-heading">
        <h3 class="move-title">异动测算</h3>
        <span class="move-sub">{{ estimate.boardLabel }} · 涨跌停 ±{{ estimate.limitPercent }}%</span>
      </div>
      <div class="move-quote">
        <strong class="move-quote-price" :class="quoteToneClass">{{ priceText }}</strong>
        <span class="move-quote-change" :class="quoteToneClass">{{ changeText }}</span>
      </div>
    </header>

    <div class="move-list" role="list">
      <div
        v-for="row in rows"
        :key="row.kind + '-' + row.date"
        class="move-row"
        :class="row.kind"
        role="listitem"
      >
        <div class="move-date">
          <span class="move-day">{{ row.date.slice(5) }}</span>
          <span class="move-weekday">{{ row.weekday }}</span>
          <span class="move-tag" :class="row.kind">{{ tagOf(row) }}</span>
        </div>

        <template v-if="row.kind === 'future'">
          <div class="move-block">
            <span class="move-label">涨停</span>
            <strong class="move-number up">{{ formatPrice(row.limitUpPrice) }}</strong>
            <span class="move-delta up">{{ formatPercent(row.limitUpPercent) }}</span>
          </div>
          <div class="move-block">
            <span class="move-label">跌停</span>
            <strong class="move-number down">{{ formatPrice(row.limitDownPrice) }}</strong>
            <span class="move-delta down">{{ formatPercent(row.limitDownPercent) }}</span>
          </div>
          <div class="move-meta">
            模拟昨收 {{ formatPrice(row.basePrice) }} · 连板累计 {{ formatPercent(row.cumulativePercent) }}
          </div>
        </template>

        <template v-else>
          <div class="move-block">
            <span class="move-label">{{ row.kind === 'today' ? '最新' : '收盘' }}</span>
            <strong class="move-number">{{ formatPrice(row.price) }}</strong>
          </div>
          <div class="move-block">
            <span class="move-label">涨跌幅</span>
            <strong class="move-number" :class="toneOf(row.changePercent)">{{ formatPercent(row.changePercent) }}</strong>
          </div>
          <div class="move-meta">昨收 {{ formatPrice(row.basePrice) }}</div>
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
}>()

const estimate = computed(() => buildMoveEstimate({
  code: props.code,
  name: props.name,
  price: props.price,
  changePercent: props.changePercent,
  prevClose: props.prevClose,
  dayPoints: props.dayPoints
}))

const rows = computed<MoveEstimateRow[]>(() => {
  const { past, today, future } = estimate.value
  return [
    ...past,
    ...(today ? [today] : []),
    ...future
  ]
})

const quoteToneClass = computed(() => toneOf(props.changePercent))
const priceText = computed(() => Number.isFinite(props.price) && props.price > 0 ? props.price.toFixed(2) : '--')
const changeText = computed(() => formatPercent(props.changePercent))

function toneOf(value: number | null): string {
  if (value === null || !Number.isFinite(value) || value === 0) return 'flat'
  return value > 0 ? 'up' : 'down'
}

function formatPrice(value: number | null): string {
  return value === null || !Number.isFinite(value) || value <= 0 ? '--' : value.toFixed(2)
}

function formatPercent(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return '--'
  const sign = value > 0 ? '+' : ''
  return sign + value.toFixed(2) + '%'
}

function tagOf(row: MoveEstimateRow): string {
  if (row.kind === 'today') return '今日'
  return row.kind === 'past' ? '实际' : '测算'
}
</script>

<style scoped>
.move-estimate{display:flex;flex-direction:column;gap:8px;flex-shrink:0;margin-top:12px;padding:12px}
.move-head{display:flex;align-items:center;justify-content:space-between;gap:10px}
.move-heading{display:flex;flex-direction:column;gap:2px;min-width:0}
.move-title{margin:0;font-size:var(--fs-md);font-weight:700;color:var(--text-primary)}
.move-sub{font-size:var(--fs-xs);color:var(--text-muted)}
.move-quote{display:inline-flex;align-items:baseline;gap:6px;font-variant-numeric:tabular-nums}
.move-quote-price{font-size:15px;font-weight:700}
.move-quote-change{font-size:var(--fs-sm);font-weight:650}
.up{color:var(--rise)}
.down{color:var(--fall)}
.flat{color:var(--text-secondary)}
.move-list{display:flex;flex-direction:column;max-height:246px;overflow-y:auto;scrollbar-width:none}
.move-list::-webkit-scrollbar{display:none}
.move-row{display:grid;grid-template-columns:74px minmax(0,1fr) minmax(0,1fr);gap:4px 8px;padding:7px 2px;border-top:1px solid var(--divider-color)}
.move-row:first-child{border-top:none}
.move-row.today{background:var(--surface-2)}
.move-date{display:flex;flex-direction:column;gap:1px;min-width:0}
.move-day{font-size:var(--fs-sm);font-weight:650;color:var(--text-primary);font-variant-numeric:tabular-nums}
.move-weekday{font-size:9px;color:var(--text-muted)}
.move-tag{align-self:flex-start;margin-top:2px;padding:0 4px;border-radius:3px;font-size:8px;line-height:12px;font-weight:700}
.move-tag.past{color:var(--text-muted);background:var(--surface-2)}
.move-tag.today{color:var(--accent);background:var(--accent-soft)}
.move-tag.future{color:var(--c-amber);background:var(--c-amber-soft)}
.move-block{display:flex;flex-direction:column;gap:1px;min-width:0}
.move-label{font-size:9px;color:var(--text-muted)}
.move-number{font-size:var(--fs-sm);font-weight:650;font-variant-numeric:tabular-nums}
.move-delta{font-size:9px;font-weight:600;font-variant-numeric:tabular-nums}
.move-meta{grid-column:2 / -1;font-size:9px;color:var(--text-muted);font-variant-numeric:tabular-nums}
.move-empty{padding:12px 0;text-align:center;font-size:var(--fs-sm);color:var(--text-muted)}
</style>
