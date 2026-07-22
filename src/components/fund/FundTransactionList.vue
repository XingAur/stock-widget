<template>
  <section class="transaction-dialog" role="dialog" aria-modal="true" aria-label="基金交易记录">
    <header class="dialog-head">
      <div><span class="eyebrow">LOCAL LEDGER</span><h2>交易记录</h2><small>{{ fundName }} · {{ code }}</small></div>
      <button type="button" aria-label="关闭交易记录" title="关闭" @click="emit('close')"><X :size="15" aria-hidden="true" /></button>
    </header>

    <div v-if="ledger" class="record-list">
      <article v-for="transaction in sortedTransactions" :key="transaction.id" class="record-item">
        <div class="record-icon" :class="transaction.type">{{ transactionIcon(transaction.type) }}</div>
        <div class="record-main">
          <div class="record-title"><strong>{{ transactionLabel(transaction.type) }}</strong><span>{{ transaction.tradeDate }}</span></div>
          <p>{{ transactionSummary(transaction) }}</p>
          <div class="record-meta"><span>净值 {{ transaction.nav.toFixed(4) }}</span><span v-if="transaction.type !== 'adjustment'">手续费 {{ formatMoney(transaction.fee) }}</span></div>
        </div>
        <div v-if="transaction.type !== 'adjustment'" class="record-actions">
          <button type="button" @click="emit('edit', transaction)">编辑</button>
          <button type="button" class="danger" @click="emit('delete', transaction.id)">删除</button>
        </div>
        <span v-else class="boundary-chip">计算边界</span>
      </article>

      <article class="record-item baseline">
        <div class="record-icon baseline">初</div>
        <div class="record-main">
          <div class="record-title"><strong>期初持仓</strong><span>{{ ledger.baseline.date }}</span></div>
          <p>持有 {{ formatMoney(ledger.baseline.holdingAmount) }} · 收益 {{ formatMoney(ledger.baseline.holdingProfit, true) }}</p>
          <div class="record-meta"><span>净值 {{ ledger.baseline.nav.toFixed(4) }}</span><span>{{ formatShares(ledger.baseline.shares) }} 份</span></div>
        </div>
        <span class="boundary-chip">不可删除</span>
      </article>
    </div>

    <div v-else class="record-empty"><span>记</span><strong>暂无交易记录</strong><p>首次加仓或修改持仓后会在这里形成账本</p></div>
    <footer><span>记录仅保存在本机，不代表真实交易</span><button type="button" @click="emit('close')">完成</button></footer>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { X } from 'lucide-vue-next'
import type { FundLedger, FundTransaction } from '../../utils/fundLedger'

const props = defineProps<{
  ledger: FundLedger | null
  fundName: string
  code: string
}>()
const emit = defineEmits<{
  close: []
  edit: [transaction: FundTransaction]
  delete: [id: string]
}>()

const sortedTransactions = computed(() => [...(props.ledger?.transactions ?? [])]
  .sort((left, right) => {
    const dateOrder = right.tradeDate.localeCompare(left.tradeDate)
    return dateOrder || right.createdAt.localeCompare(left.createdAt)
  }))

function transactionLabel(type: FundTransaction['type']): string {
  return { buy: '加仓', sell: '减仓', adjustment: '持仓调整' }[type]
}

function transactionIcon(type: FundTransaction['type']): string {
  return { buy: '买', sell: '卖', adjustment: '调' }[type]
}

function transactionSummary(transaction: FundTransaction): string {
  if (transaction.type === 'buy') {
    return `${formatMoney(transaction.amount)} · 确认 ${formatShares(transaction.shares)} 份`
  }
  if (transaction.type === 'sell') {
    return `卖出 ${formatShares(transaction.shares)} 份 · 到账 ${formatMoney(transaction.proceeds)}`
  }
  return `校准至 ${formatMoney(transaction.holdingAmount)} · 收益 ${formatMoney(transaction.holdingProfit, true)}`
}

function formatMoney(value: number, signed = false): string {
  return `${signed && value > 0 ? '+' : ''}¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatShares(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}
</script>

<style scoped>
.transaction-dialog { width: min(470px, calc(100% - 30px)); max-height: calc(100% - 24px); display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--border-color); border-radius: 16px; color: var(--text-primary); background: var(--solid-bg); box-shadow: 0 24px 80px rgba(0, 0, 0, .48); }
.dialog-head { flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 13px 16px 11px; border-bottom: 1px solid var(--divider-color); }
.eyebrow { display: block; color: #6f94f8; font-size: 10px; font-weight: 800; letter-spacing: 0; }
.dialog-head h2 { display: inline-block; margin-top: 2px; font-size: 16px; }
.dialog-head small { margin-left: 8px; color: var(--text-muted); font-size: 10px; }
.dialog-head > button { width: 25px; height: 25px; border: 0; border-radius: 7px; color: var(--text-muted); background: var(--card-bg); cursor: pointer; }
.record-list { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 13px; }
.record-item { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px 3px; border-bottom: 1px solid var(--divider-color); }
.record-icon { display: grid; width: 28px; height: 28px; place-items: center; border-radius: 9px; color: #86a6ff; background: rgba(91, 140, 255, .12); font-size: 15px; }
.record-icon.sell { color: #f1aa66; background: rgba(245, 158, 85, .1); }
.record-icon.adjustment { color: #b69df7; background: rgba(139, 92, 246, .1); }
.record-icon.baseline { color: var(--text-muted); background: var(--card-bg); font-size: 10px; }
.record-main { min-width: 0; }
.record-title { display: flex; align-items: center; gap: 7px; }
.record-title strong { font-size: 10px; }
.record-title span { color: var(--text-muted); font-size: 10px; }
.record-main p { overflow: hidden; margin-top: 3px; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.record-meta { display: flex; gap: 10px; margin-top: 4px; color: var(--text-muted); font-size: 10px; }
.record-actions { display: flex; gap: 3px; }
.record-actions button { padding: 4px 6px; border: 0; border-radius: 5px; color: #8fb0ff; background: var(--card-bg); font: inherit; font-size: 10px; cursor: pointer; }
.record-actions button:hover { background: var(--card-bg-hover); }
.record-actions button.danger { color: #f28b82; }
.boundary-chip { padding: 3px 5px; border-radius: 4px; color: var(--text-muted); background: var(--card-bg); font-size: 10px; }
.baseline { opacity: .76; }
.record-empty { min-height: 220px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: var(--text-muted); }
.record-empty > span { display: grid; width: 40px; height: 40px; place-items: center; margin-bottom: 8px; border: 1px solid var(--border-color); border-radius: 50%; color: #8fb0ff; }
.record-empty strong { color: var(--text-secondary); font-size: 11px; }
.record-empty p { margin-top: 4px; font-size: 10px; }
footer { flex: 0 0 42px; display: flex; align-items: center; justify-content: space-between; padding: 0 15px; border-top: 1px solid var(--divider-color); }
footer span { color: var(--text-muted); font-size: 10px; }
footer button { min-width: 62px; height: 27px; border: 0; border-radius: 7px; color: white; background: #5b82ed; font: inherit; font-size: 10px; cursor: pointer; }
</style>
