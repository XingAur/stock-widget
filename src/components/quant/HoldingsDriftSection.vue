<template>
  <section class="quant-section">
    <h4>
      持仓对照
      <div class="target-switch" role="group" aria-label="目标权重模式">
        <button type="button" :class="{ active: targetMode === 'equal' }" @click="$emit('switchMode', 'equal')">等权</button>
        <button type="button" :class="{ active: targetMode === 'score' }" @click="$emit('switchMode', 'score')">评分加权</button>
      </div>
      <label class="quant-assets">
        总资金
        <input
          :value="totalAssets"
          type="number"
          min="0"
          step="1"
          placeholder="万"
          title="账户总资金（万元，含现金）"
          @change="$emit('updateAssets', ($event.target as HTMLInputElement).value)"
          @keydown.stop
        >
        万
      </label>
    </h4>
    <div v-if="rows.length === 0" class="quant-hint">尚未录入持仓：右键自选卡片可录入成本与股数</div>
    <div v-else-if="!totalAssets" class="quant-hint">未填总资金：金额按已录持仓市值折算；填写后按总资产口径并显示建议买入金额</div>
    <div v-if="cashRow" class="quant-hold cash">
      <span class="quant-name">现金</span>
      <div class="quant-bars"><div class="quant-bar current" :style="{ width: `${Math.min(100, cashRow.percent)}%` }" /></div>
      <span class="quant-drift">{{ cashRow.text }}<i>{{ amountText(cashRow.amount) }}</i></span>
    </div>
    <div v-for="row in rows" :key="row.code" class="quant-hold">
      <span class="quant-name" :title="row.name">{{ row.name }}</span>
      <div class="quant-bars">
        <div class="quant-bar target" :style="{ width: `${row.targetPercent}%` }" />
        <div class="quant-bar current" :style="{ width: `${row.currentPercent}%` }" />
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
  currentPercent: number
  drift: number
  driftAmount: number | null
  held: boolean
}

defineProps<{
  rows: DriftRow[]
  targetMode: 'equal' | 'score'
  totalAssets: string
  cashRow: { percent: number; amount: number; text: string } | null
}>()

defineEmits<{
  switchMode: [mode: 'equal' | 'score']
  updateAssets: [value: string]
}>()

function amountText(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || Math.abs(amount) < 1) {
    return ''
  }
  const abs = Math.abs(amount)
  const text = abs >= 10_000 ? `${(abs / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万` : abs.toFixed(0)
  return `¥${text}`
}

function driftTone(drift: number): string {
  return Math.abs(drift) < 0.005 ? '' : drift > 0 ? 'down' : 'up'
}

function driftText(drift: number, held: boolean): string {
  if (Math.abs(drift) < 0.005) {
    return '持平'
  }
  const action = drift > 0 ? '减仓' : held ? '加仓' : '建仓'
  return `${action} ${Math.abs(drift * 100).toFixed(1)}%`
}
</script>

<style scoped>
.quant-section h4{margin:0 0 6px;font-size:11px;font-weight:700;color:var(--text-secondary);display:flex;align-items:center}
.target-switch{display:inline-flex;margin-left:6px;padding:1px;border:1px solid rgba(255,255,255,.12);border-radius:6px}
.target-switch button{height:14px;padding:0 6px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);font-size:9px;font-weight:700;cursor:pointer}
.target-switch button.active{color:#f8fbff;background:rgba(45,124,246,.75)}
.quant-assets{display:inline-flex;align-items:center;gap:3px;margin-left:auto;font-size:9px;font-weight:400;color:var(--text-muted)}
.quant-assets input{width:44px;height:18px;padding:0 4px;border:1px solid rgba(255,255,255,.14);border-radius:5px;background:rgba(255,255,255,.05);color:var(--text-primary);font-size:10px;outline:none}
.quant-assets input:focus{border-color:rgba(93,168,255,.55)}
.quant-hint{margin:6px 0 0;font-size:10px;line-height:1.5;color:var(--text-muted)}
.quant-hold{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.03)}
.quant-hold+.quant-hold{margin-top:3px}
.quant-hold.cash{background:rgba(255,255,255,.02)}
.quant-name{flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quant-bars{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.quant-bar{height:4px;border-radius:2px}
.quant-bar.target{background:rgba(93,168,255,.55)}
.quant-bar.current{background:rgba(255,255,255,.22)}
.quant-drift{flex:0 0 64px;display:flex;flex-direction:column;align-items:flex-end;gap:1px;font-size:10px;font-weight:700;text-align:right;white-space:nowrap;color:var(--text-muted)}
.quant-drift i{font-style:normal;font-size:9px;font-weight:500;color:var(--text-muted);opacity:.8}
.quant-drift.up{color:#ff7474}
.quant-drift.down{color:#3ad283}
</style>
