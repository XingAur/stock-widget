<template>
  <section class="quant-section">
    <h4 class="cl-section-head">
      持仓对照
      <div class="cl-segmented cl-segmented--xs target-switch" role="group" aria-label="目标权重模式">
        <button class="cl-segmented__item" type="button" :class="{ 'is-active': targetMode === 'equal' }" :aria-pressed="targetMode === 'equal'" @click="$emit('switchMode', 'equal')">等权</button>
        <button class="cl-segmented__item" type="button" :class="{ 'is-active': targetMode === 'score' }" :aria-pressed="targetMode === 'score'" @click="$emit('switchMode', 'score')">评分加权</button>
      </div>
    </h4>
    <div v-if="holdingCount === 0" class="cl-hint quant-hint">尚未录入股票持仓：右键自选卡片可填写成本与股数。入选标的仅显示目标比例。</div>
    <div v-else-if="missingHeldQuotes > 0" class="cl-hint quant-hint">{{ missingHeldQuotes }} 只已录持仓缺有效报价，暂不计算金额和权重偏离。</div>
    <div v-else class="cl-hint quant-hint">按已录入的 {{ holdingCount }} 只股票持仓市值 {{ amountText(holdingValue) }} 对照；不包含未录入的现金或其他资产。</div>
    <div v-for="row in rows" :key="row.code" class="cl-card cl-card--static cl-card--row quant-hold">
      <span class="quant-name" :title="row.name">{{ row.name }}</span>
      <div class="quant-bars">
        <div class="quant-bar target" :style="{ width: `${row.targetPercent}%` }" />
        <div class="quant-bar current" :style="{ width: `${row.currentPercent ?? 0}%` }" />
      </div>
      <span class="quant-drift" :class="driftTone(row.drift)">
        {{ driftText(row.drift, row.held) }}
        <i>{{ amountText(row.driftAmount) }}</i>
      </span>
    </div>
  </section>
</template>

<script setup lang="ts">
export interface DriftRow {
  code: string
  name: string
  targetPercent: number
  currentPercent: number | null
  drift: number | null
  driftAmount: number | null
  held: boolean
}

defineProps<{
  rows: DriftRow[]
  targetMode: 'equal' | 'score'
  holdingCount: number
  holdingValue: number | null
  missingHeldQuotes: number
}>()

defineEmits<{
  switchMode: [mode: 'equal' | 'score']
}>()

function amountText(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || Math.abs(amount) < 1) {
    return ''
  }
  const abs = Math.abs(amount)
  const text = abs >= 10_000 ? `${(abs / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万` : abs.toFixed(0)
  return `¥${text}`
}

function driftTone(drift: number | null): string {
  if (drift === null) return ''
  return Math.abs(drift) < 0.005 ? '' : drift > 0 ? 'down' : 'up'
}

function driftText(drift: number | null, held: boolean): string {
  if (drift === null) return held ? '待报价' : '待持仓基数'
  if (Math.abs(drift) < 0.005) {
    return '持平'
  }
  const relation = drift > 0 ? '高于目标' : held ? '低于目标' : '未持有目标'
  return `${relation} ${Math.abs(drift * 100).toFixed(1)}%`
}
</script>
