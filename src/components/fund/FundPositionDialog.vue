<template>
  <section class="cl-dialog position-dialog" role="dialog" aria-modal="true" :aria-label="dialogTitle">
    <header class="cl-dialog__head dialog-head">
      <div>
        <span class="cl-eyebrow cl-eyebrow--accent">POSITION LEDGER</span>
        <h2 class="cl-dialog__title">{{ dialogTitle }}</h2>
      </div>
      <button class="cl-close" type="button" aria-label="关闭持仓录入" title="关闭" @click="emit('close')"><X aria-hidden="true" /></button>
    </header>

    <div class="cl-alert cl-alert--warning cl-alert--banner simulation-notice"><CircleAlert aria-hidden="true" /> 仅记录模拟持仓，请先在真实交易平台完成操作</div>

    <div class="fund-strip">
      <div><strong>{{ fundName }}</strong><small>{{ code }}</small></div>
      <div><span>参考净值</span><strong class="cl-num">{{ currentNav?.toFixed(4) || '--' }}</strong></div>
    </div>

    <form class="cl-dialog__body" @submit.prevent="submitForm">
      <div class="form-grid">
        <label v-if="mode === 'buy'" class="cl-field wide">
          <span class="cl-field__label">加仓金额</span>
          <div class="cl-input-wrap money-input"><span class="cl-input-wrap__prefix">¥</span><input v-model.number="form.amount" class="cl-input cl-input--lg" type="number" min="0" step="0.01" placeholder="输入加仓金额" autofocus /></div>
        </label>

        <label v-if="mode === 'sell'" class="cl-field wide">
          <span class="cl-field__label">卖出份额 <small>最多 {{ formatShares(availableShares) }} 份</small></span>
          <input v-model.number="form.shares" class="cl-input" type="number" min="0" step="0.000001" placeholder="输入卖出份额" autofocus />
          <div class="cl-segmented cl-segmented--ghost cl-segmented--block quick-shares" role="group" aria-label="快捷份额">
            <button v-for="shortcut in sellShortcuts" :key="shortcut.label" class="cl-segmented__item" type="button" @click="setSellFraction(shortcut.ratio)">{{ shortcut.label }}</button>
          </div>
        </label>

        <template v-if="mode === 'adjust'">
          <label class="cl-field"><span class="cl-field__label">持有金额</span><input v-model.number="form.holdingAmount" class="cl-input" type="number" min="0" step="0.01" placeholder="0.00" /></label>
          <label class="cl-field"><span class="cl-field__label">持有收益</span><input v-model.number="form.holdingProfit" class="cl-input" type="number" step="0.01" placeholder="可输入负数" /></label>
        </template>

        <label v-if="mode !== 'adjust'" class="cl-field">
          <span class="cl-field__label">{{ mode === 'buy' ? '买入费率' : '卖出费率' }} (%)</span>
          <input v-model.number="form.feeRate" class="cl-input" type="number" min="0" max="100" step="0.001" />
        </label>
        <label class="cl-field">
          <span class="cl-field__label">确认净值</span>
          <input v-model.number="form.nav" class="cl-input" type="number" min="0" step="0.0001" />
        </label>
        <label class="cl-field">
          <span class="cl-field__label">{{ mode === 'adjust' ? '调整日期' : '交易日期' }}</span>
          <input v-model="form.tradeDate" class="cl-input" type="date" :min="minimumTradeDate || undefined" :max="today" />
        </label>
        <div class="nav-match">
          <span>净值匹配</span>
          <strong>{{ navHint || '按所选日期自动匹配' }}</strong>
        </div>
      </div>

      <div v-if="mode !== 'adjust'" class="cl-panel preview-card">
        <template v-if="mode === 'buy'">
          <div><span>预计手续费</span><strong>{{ formatMoney(buyPreview.fee) }}</strong></div>
          <div><span>预计确认份额</span><strong>{{ formatShares(buyPreview.shares) }}</strong></div>
        </template>
        <template v-else>
          <div><span>预计到账</span><strong>{{ formatMoney(sellPreview.proceeds) }}</strong></div>
          <div><span>预计已实现收益</span><strong :class="profitClass(sellPreview.realizedProfit)">{{ formatMoney(sellPreview.realizedProfit, true) }}</strong></div>
        </template>
      </div>

      <div v-if="errors.length" class="cl-field__error form-errors" role="alert">
        <span v-for="error in errors" :key="error">{{ error }}</span>
      </div>

      <footer class="dialog-actions">
        <button class="cl-btn cl-btn--ghost" type="button" @click="emit('close')">取消</button>
        <button class="cl-btn cl-btn--primary primary" type="submit">{{ initialTransaction ? '保存修改' : `确认${dialogTitle}` }}</button>
      </footer>
    </form>
  </section>
</template>

<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { CircleAlert, X } from 'lucide-vue-next'
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
/* 外观来自 coolove-ui（cl-dialog / cl-field / cl-input--lg / cl-alert--banner），这里只排布表单 */
.position-dialog { width: min(440px, calc(100% - 30px)); max-height: calc(100% - 24px); overflow-y: auto; }
.dialog-head .cl-dialog__title { margin-top: 2px; font-size: var(--fs-xl); }
.simulation-notice { font-size: 10px; }
.fund-strip { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 16px; border-bottom: 1px solid var(--divider-color); }
.fund-strip > div:first-child { min-width: 0; }
.fund-strip strong, .fund-strip small, .fund-strip span { display: block; }
.fund-strip > div:first-child strong { overflow: hidden; max-width: 280px; text-overflow: ellipsis; white-space: nowrap; font-size: var(--fs-xs); }
.fund-strip small, .fund-strip span { margin-top: 2px; color: var(--text-muted); font-size: 10px; }
.fund-strip > div:last-child { text-align: right; }
.fund-strip > div:last-child strong { margin-top: 2px; font-size: var(--fs-sm); }
.cl-dialog__body { padding-top: 11px; padding-bottom: 14px; }
.form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 9px 11px; }
.form-grid .cl-field { gap: 4px; }
.form-grid .cl-field__label { display: flex; justify-content: space-between; color: var(--text-secondary); font-size: 10px; font-weight: 500; }
.form-grid .cl-field__label small { color: var(--text-muted); font-size: 10px; }
.wide { grid-column: 1 / -1; }
.quick-shares { margin-top: 6px; }
.nav-match { align-self: end; height: var(--ctl-h); padding: 4px 8px; border-radius: var(--radius-sm); background: var(--surface-1); }
.nav-match span { display: block; color: var(--text-muted); font-size: 10px; line-height: 1; }
.nav-match strong { display: block; overflow: hidden; margin-top: 2px; color: var(--text-secondary); text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
.preview-card { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; padding: 9px 10px; border-color: color-mix(in srgb, var(--accent) 14%, transparent); background: color-mix(in srgb, var(--accent) 7%, transparent); }
.preview-card span, .preview-card strong { display: block; }
.preview-card span { color: var(--text-muted); font-size: 10px; }
.preview-card strong { margin-top: 3px; font-size: var(--fs-xs); font-variant-numeric: tabular-nums; }
.up { color: var(--rise); }
.down { color: var(--fall); }
.form-errors { display: flex; flex-wrap: wrap; gap: 3px 8px; margin-top: 8px; font-size: 10px; }
.form-errors span::before { content: '• '; }
.dialog-actions { display: flex; justify-content: flex-end; gap: 7px; margin-top: 12px; }
.dialog-actions .cl-btn { min-width: 74px; }
</style>
