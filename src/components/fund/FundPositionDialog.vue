<template>
  <section class="position-dialog" role="dialog" :aria-label="dialogTitle">
    <header class="dialog-head">
      <div>
        <span class="eyebrow">POSITION LEDGER</span>
        <h2>{{ dialogTitle }}</h2>
      </div>
      <button type="button" title="关闭" @click="emit('close')">×</button>
    </header>

    <div class="simulation-notice"><i>!</i> 仅记录模拟持仓，请先在真实交易平台完成操作</div>

    <div class="fund-strip">
      <div><strong>{{ fundName }}</strong><small>{{ code }}</small></div>
      <div><span>参考净值</span><strong>{{ currentNav?.toFixed(4) || '--' }}</strong></div>
    </div>

    <form @submit.prevent="submitForm">
      <div class="form-grid">
        <label v-if="mode === 'buy'" class="wide">
          <span>加仓金额</span>
          <div class="money-input"><b>¥</b><input v-model.number="form.amount" type="number" min="0" step="0.01" placeholder="输入加仓金额" autofocus /></div>
        </label>

        <label v-if="mode === 'sell'" class="wide">
          <span>卖出份额 <small>最多 {{ formatShares(availableShares) }} 份</small></span>
          <input v-model.number="form.shares" type="number" min="0" step="0.000001" placeholder="输入卖出份额" autofocus />
          <div class="quick-shares">
            <button v-for="shortcut in sellShortcuts" :key="shortcut.label" type="button" @click="setSellFraction(shortcut.ratio)">{{ shortcut.label }}</button>
          </div>
        </label>

        <template v-if="mode === 'adjust'">
          <label><span>持有金额</span><input v-model.number="form.holdingAmount" type="number" min="0" step="0.01" placeholder="0.00" /></label>
          <label><span>持有收益</span><input v-model.number="form.holdingProfit" type="number" step="0.01" placeholder="可输入负数" /></label>
        </template>

        <label v-if="mode !== 'adjust'">
          <span>{{ mode === 'buy' ? '买入费率' : '卖出费率' }} (%)</span>
          <input v-model.number="form.feeRate" type="number" min="0" max="100" step="0.001" />
        </label>
        <label>
          <span>确认净值</span>
          <input v-model.number="form.nav" type="number" min="0" step="0.0001" />
        </label>
        <label>
          <span>{{ mode === 'adjust' ? '调整日期' : '交易日期' }}</span>
          <input v-model="form.tradeDate" type="date" :min="minimumTradeDate || undefined" :max="today" />
        </label>
        <div class="nav-match">
          <span>净值匹配</span>
          <strong>{{ navHint || '按所选日期自动匹配' }}</strong>
        </div>
      </div>

      <div v-if="mode !== 'adjust'" class="preview-card">
        <template v-if="mode === 'buy'">
          <div><span>预计手续费</span><strong>{{ formatMoney(buyPreview.fee) }}</strong></div>
          <div><span>预计确认份额</span><strong>{{ formatShares(buyPreview.shares) }}</strong></div>
        </template>
        <template v-else>
          <div><span>预计到账</span><strong>{{ formatMoney(sellPreview.proceeds) }}</strong></div>
          <div><span>预计已实现收益</span><strong :class="profitClass(sellPreview.realizedProfit)">{{ formatMoney(sellPreview.realizedProfit, true) }}</strong></div>
        </template>
      </div>

      <div v-if="errors.length" class="form-errors">
        <span v-for="error in errors" :key="error">{{ error }}</span>
      </div>

      <footer class="dialog-actions">
        <button type="button" @click="emit('close')">取消</button>
        <button class="primary" type="submit">{{ initialTransaction ? '保存修改' : `确认${dialogTitle}` }}</button>
      </footer>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FundNavPoint } from '../../api/stock'
import type { FundTransaction, FundTransactionInput } from '../../utils/fundLedger'
import {
  calculateBuyPreview,
  calculateSellPreview,
  findNavOnOrBefore,
  validateFundPositionForm,
  type FundPositionFormMode
} from '../../utils/fundValidation'

const props = withDefaults(defineProps<{
  mode: FundPositionFormMode
  code: string
  fundName: string
  history: FundNavPoint[]
  currentNav: number | null
  availableShares?: number
  averageCostNav?: number | null
  currentHoldingAmount?: number
  currentHoldingProfit?: number
  minimumTradeDate?: string
  initialTransaction?: FundTransaction | null
}>(), {
  availableShares: 0,
  averageCostNav: null,
  currentHoldingAmount: 0,
  currentHoldingProfit: 0,
  minimumTradeDate: '',
  initialTransaction: null
})

const emit = defineEmits<{
  close: []
  submit: [input: FundTransactionInput]
}>()
const today = new Date().toISOString().slice(0, 10)
const initial = props.initialTransaction
const form = reactive({
  amount: initial?.type === 'buy' ? initial.amount : 0,
  shares: initial?.type === 'sell' ? initial.shares : 0,
  holdingAmount: initial?.type === 'adjustment' ? initial.holdingAmount : props.currentHoldingAmount,
  holdingProfit: initial?.type === 'adjustment' ? initial.holdingProfit : props.currentHoldingProfit,
  feeRate: initial && initial.type !== 'adjustment' ? initial.feeRate : 0,
  nav: initial?.nav ?? props.currentNav ?? 0,
  tradeDate: initial?.tradeDate ?? today
})
const errors = ref<string[]>([])
const navHint = ref('')
const sellShortcuts = [
  { label: '1/4', ratio: .25 },
  { label: '1/3', ratio: 1 / 3 },
  { label: '1/2', ratio: .5 },
  { label: '全部', ratio: 1 }
]
const dialogTitle = computed(() => ({ buy: '加仓', sell: '减仓', adjust: '修改持仓' }[props.mode]))
const buyPreview = computed(() => {
  if (form.amount <= 0 || form.nav <= 0 || form.feeRate < 0) return { fee: 0, shares: 0 }
  return calculateBuyPreview(form.amount, form.feeRate, form.nav)
})
const sellPreview = computed(() => {
  if (form.shares <= 0 || form.nav <= 0 || form.feeRate < 0) return { fee: 0, proceeds: 0, realizedProfit: 0 }
  return calculateSellPreview(form.shares, form.nav, form.feeRate, props.averageCostNav || 0)
})

function matchNavForDate(date: string): void {
  if (initial?.tradeDate === date) return
  const matched = findNavOnOrBefore(props.history, date)
  if (!matched) {
    navHint.value = '未找到历史净值，请手动填写'
    return
  }
  form.nav = Number(matched.nav.toFixed(4))
  navHint.value = matched.shifted
    ? `使用前一交易日 ${matched.date}`
    : `已匹配 ${matched.date}`
}

function setSellFraction(ratio: number): void {
  form.shares = ratio === 1
    ? props.availableShares
    : Number((props.availableShares * ratio).toFixed(6))
}

function transactionId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `fund-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function submitForm(): void {
  errors.value = validateFundPositionForm(props.mode, form, props.availableShares, today, props.minimumTradeDate)
  if (errors.value.length > 0) return

  const common = {
    id: initial?.id ?? transactionId(),
    tradeDate: form.tradeDate,
    nav: Number(form.nav),
    createdAt: initial?.createdAt ?? new Date().toISOString()
  }
  if (props.mode === 'buy') {
    emit('submit', { ...common, type: 'buy', amount: Number(form.amount), feeRate: Number(form.feeRate) })
  } else if (props.mode === 'sell') {
    emit('submit', { ...common, type: 'sell', shares: Number(form.shares), feeRate: Number(form.feeRate) })
  } else {
    emit('submit', {
      ...common,
      type: 'adjustment',
      holdingAmount: Number(form.holdingAmount),
      holdingProfit: Number(form.holdingProfit)
    })
  }
}

function formatMoney(value: number, signed = false): string {
  return `${signed && value > 0 ? '+' : ''}¥${value.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function formatShares(value: number): string {
  return value.toLocaleString('zh-CN', { maximumFractionDigits: 6 })
}

function profitClass(value: number): string {
  return value > 0 ? 'up' : value < 0 ? 'down' : ''
}

watch(() => form.tradeDate, matchNavForDate, { immediate: true })
</script>

<style scoped>
.position-dialog { width: min(440px, calc(100% - 30px)); max-height: calc(100% - 24px); overflow-y: auto; border: 1px solid var(--border-color); border-radius: 16px; color: var(--text-primary); background: var(--solid-bg); box-shadow: 0 24px 80px rgba(0, 0, 0, .48); }
.dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 13px 16px 10px; }
.eyebrow { display: block; color: #6f94f8; font-size: 7px; font-weight: 800; letter-spacing: .15em; }
.dialog-head h2 { margin-top: 2px; font-size: 16px; }
.dialog-head button { width: 25px; height: 25px; border: 0; border-radius: 7px; color: var(--text-muted); background: var(--card-bg); cursor: pointer; }
.simulation-notice { padding: 6px 16px; color: #e9a25d; background: rgba(245, 158, 11, .08); font-size: 9px; }
.simulation-notice i { display: inline-grid; width: 13px; height: 13px; place-items: center; margin-right: 3px; border: 1px solid currentColor; border-radius: 50%; font-style: normal; font-size: 8px; }
.fund-strip { display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid var(--divider-color); }
.fund-strip > div:first-child { min-width: 0; }
.fund-strip strong, .fund-strip small, .fund-strip span { display: block; }
.fund-strip > div:first-child strong { overflow: hidden; max-width: 280px; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; }
.fund-strip small, .fund-strip span { margin-top: 2px; color: var(--text-muted); font-size: 8px; }
.fund-strip > div:last-child { text-align: right; }
.fund-strip > div:last-child strong { margin-top: 2px; font-size: 12px; }
form { padding: 11px 16px 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 11px; }
label { display: block; min-width: 0; }
label.wide { grid-column: 1 / -1; }
label > span, .nav-match > span { display: flex; justify-content: space-between; margin-bottom: 4px; color: var(--text-secondary); font-size: 9px; }
label > span small { color: var(--text-muted); font-size: 8px; }
input { width: 100%; height: 31px; padding: 0 9px; border: 1px solid var(--border-color); outline: none; border-radius: 7px; color: var(--text-primary); background: var(--input-bg); font: inherit; font-size: 11px; user-select: text; }
input:focus { border-color: rgba(111, 148, 248, .6); box-shadow: 0 0 0 2px rgba(91, 140, 255, .1); }
.money-input { position: relative; }
.money-input b { position: absolute; top: 4px; left: 9px; color: #8fb0ff; font-size: 18px; }
.money-input input { height: 39px; padding-left: 32px; font-size: 17px; font-weight: 650; }
.quick-shares { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; margin-top: 6px; }
.quick-shares button { height: 23px; border: 1px solid var(--border-color); border-radius: 7px; color: var(--text-muted); background: transparent; font: inherit; font-size: 9px; cursor: pointer; }
.quick-shares button:hover { color: #8fb0ff; border-color: rgba(111, 148, 248, .5); }
.nav-match { align-self: end; height: 31px; padding: 4px 8px; border-radius: 7px; background: var(--card-bg); }
.nav-match span { margin: 0; color: var(--text-muted); font-size: 7px; }
.nav-match strong { display: block; overflow: hidden; margin-top: 2px; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 8px; }
.preview-card { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding: 9px 10px; border: 1px solid rgba(111, 148, 248, .12); border-radius: 9px; background: rgba(91, 140, 255, .07); }
.preview-card span, .preview-card strong { display: block; }
.preview-card span { color: var(--text-muted); font-size: 8px; }
.preview-card strong { margin-top: 3px; font-size: 11px; }
.up { color: var(--danger); }
.down { color: var(--success); }
.form-errors { display: flex; flex-wrap: wrap; gap: 3px 8px; margin-top: 8px; color: #f28b82; font-size: 8px; }
.form-errors span::before { content: '• '; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
.dialog-actions button { min-width: 74px; height: 30px; border: 1px solid var(--border-color); border-radius: 8px; color: var(--text-secondary); background: transparent; font: inherit; font-size: 10px; cursor: pointer; }
.dialog-actions button.primary { border-color: transparent; color: white; background: linear-gradient(135deg, #557fef, #6f94f8); box-shadow: 0 6px 17px rgba(91, 140, 255, .22); }
</style>
