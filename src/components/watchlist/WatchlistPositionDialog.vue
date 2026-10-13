<template>
  <div class="cl-backdrop cl-backdrop--contained position-overlay" @click.self="$emit('close')">
    <form
      ref="formEl"
      class="cl-dialog cl-dialog--xs position-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
      @submit.prevent="$emit('save')"
      @click.stop
      @keydown="$emit('keydown', $event)"
    >
      <header class="cl-dialog__head position-dialog-header">
        <h3 class="cl-dialog__title">{{ title }}</h3>
        <button class="cl-close position-close-btn" type="button" aria-label="关闭持仓录入" title="关闭" @click="$emit('close')">
          <X aria-hidden="true" />
        </button>
      </header>
      <div v-if="dialog.assetType === 'stock'" class="cl-dialog__body cl-stack position-fields">
        <label class="cl-field position-field">
          <span class="cl-field__label">成本价</span>
          <input v-model="dialog.stockCostPrice" class="cl-input cl-num" type="number" min="0" step="0.001" inputmode="decimal" />
        </label>
        <label class="cl-field position-field">
          <span class="cl-field__label">股数</span>
          <input v-model="dialog.stockShares" class="cl-input cl-num" type="number" min="0" step="1" inputmode="decimal" />
        </label>
        <p v-if="dialog.error" class="cl-field__error position-error" role="alert">{{ dialog.error }}</p>
      </div>
      <div v-else class="cl-dialog__body cl-stack position-fields">
        <label class="cl-field position-field">
          <span class="cl-field__label">持有金额</span>
          <input v-model="dialog.fundHoldingAmount" class="cl-input cl-num" type="number" min="0" step="0.01" inputmode="decimal" />
        </label>
        <label class="cl-field position-field">
          <span class="cl-field__label">收益</span>
          <input v-model="dialog.fundProfit" class="cl-input cl-num" type="number" step="0.01" inputmode="decimal" />
        </label>
        <p v-if="dialog.error" class="cl-field__error position-error" role="alert">{{ dialog.error }}</p>
      </div>
      <footer class="cl-dialog__foot position-dialog-actions">
        <button class="cl-btn cl-btn--ghost position-secondary-btn" type="button" @click="$emit('clear')">清除</button>
        <button class="cl-btn cl-btn--primary position-primary-btn" type="submit">保存</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { X } from 'lucide-vue-next'

export interface WatchlistPositionDialogModel {
  assetType: string
  stockCostPrice: string
  stockShares: string
  fundHoldingAmount: string
  fundProfit: string
  error: string
}

const props = defineProps<{
  dialog: WatchlistPositionDialogModel
}>()

const title = computed(() => props.dialog.assetType === 'stock' ? '录入股票持仓' : '录入基金持有')

defineEmits<{
  close: []
  save: []
  clear: []
  keydown: [event: KeyboardEvent]
}>()

const formEl = ref<HTMLElement | null>(null)
defineExpose({ formEl })
</script>
