<template>
  <section class="cl-dialog transaction-dialog" role="dialog" aria-modal="true" aria-label="基金交易记录">
    <header class="cl-dialog__head dialog-head">
      <div><span class="cl-eyebrow cl-eyebrow--accent">LOCAL LEDGER</span><h2 class="cl-dialog__title">交易记录</h2><small>{{ fundName }} · {{ code }}</small></div>
      <button class="cl-close" type="button" aria-label="关闭交易记录" title="关闭" @click="emit('close')"><X aria-hidden="true" /></button>
    </header>

    <div v-if="ledger" class="cl-divided record-list">
      <article v-for="transaction in sortedTransactions" :key="transaction.id" class="record-item">
        <div class="cl-tile record-icon" :class="[transaction.type, TILE_CLASS[transaction.type]]">{{ transactionIcon(transaction.type) }}</div>
        <div class="record-main">
          <div class="record-title"><strong>{{ transactionLabel(transaction.type) }}</strong><span>{{ transaction.tradeDate }}</span></div>
          <p>{{ transactionSummary(transaction) }}</p>
          <div class="record-meta"><span>净值 {{ transaction.nav.toFixed(4) }}</span><span v-if="transaction.type !== 'adjustment'">手续费 {{ formatMoney(transaction.fee) }}</span></div>
        </div>
        <div v-if="transaction.type !== 'adjustment'" class="record-actions">
          <button class="cl-btn cl-btn--soft cl-btn--sm" type="button" @click="emit('edit', transaction)">编辑</button>
          <button class="cl-btn cl-btn--danger cl-btn--sm danger" type="button" @click="emit('delete', transaction.id)">删除</button>
        </div>
        <span v-else class="cl-badge boundary-chip">计算边界</span>
      </article>

      <article class="record-item baseline">
        <div class="cl-tile cl-tile--muted record-icon baseline">初</div>
        <div class="record-main">
          <div class="record-title"><strong>期初持仓</strong><span>{{ ledger.baseline.date }}</span></div>
          <p>持有 {{ formatMoney(ledger.baseline.holdingAmount) }} · 收益 {{ formatMoney(ledger.baseline.holdingProfit, true) }}</p>
          <div class="record-meta"><span>净值 {{ ledger.baseline.nav.toFixed(4) }}</span><span>{{ formatShares(ledger.baseline.shares) }} 份</span></div>
        </div>
        <span class="cl-badge boundary-chip">不可删除</span>
      </article>
    </div>

    <div v-else class="cl-empty record-empty"><span class="cl-empty__icon">记</span><strong class="cl-empty__title">暂无交易记录</strong><p class="cl-empty__desc">首次加仓或修改持仓后会在这里形成账本</p></div>
    <footer class="cl-dialog__foot record-foot"><span>记录仅保存在本机，不代表真实交易</span><button class="cl-btn cl-btn--primary cl-btn--sm" type="button" @click="emit('close')">完成</button></footer>
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
// 交易类型 → coolove-ui 方块图标配色：加仓用强调色，减仓琥珀，调整紫色
const TILE_CLASS: Record<string, string> = { buy: '', sell: 'cl-tile--warning', adjustment: 'cl-tile--violet' }
</script>

<style scoped>
.transaction-dialog { width: min(470px, calc(100% - 30px)); max-height: calc(100% - 24px); }
.dialog-head { border-bottom: 1px solid var(--divider-color); padding-bottom: 11px; }
.dialog-head .cl-dialog__title { display: inline-block; margin-top: 2px; font-size: var(--fs-xl); }
.dialog-head small { margin-left: 8px; color: var(--text-muted); font-size: 10px; }
.record-list { flex: 1; min-height: 0; overflow-y: auto; padding: 0 13px; }
.record-item { display: grid; grid-template-columns: 30px minmax(0, 1fr) auto; align-items: center; gap: 9px; padding: 9px 3px; }
.record-main { min-width: 0; }
.record-title { display: flex; align-items: center; gap: 7px; }
.record-title strong { font-size: 10px; }
.record-title span { color: var(--text-muted); font-size: 10px; }
.record-main p { overflow: hidden; margin-top: 3px; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.record-meta { display: flex; gap: 10px; margin-top: 4px; color: var(--text-muted); font-size: 10px; }
.record-actions { display: flex; gap: 3px; }
.record-actions .cl-btn { height: 22px; padding: 0 6px; font-size: 10px; }
.baseline { opacity: .76; }
.record-empty { min-height: 220px; }
.record-empty .cl-empty__icon { border-radius: 50%; color: var(--accent-text); }
.record-foot { align-items: center; justify-content: space-between; border-top: 1px solid var(--divider-color); padding-top: 9px; padding-bottom: 9px; }
.record-foot span { color: var(--text-muted); font-size: 10px; }
</style>
