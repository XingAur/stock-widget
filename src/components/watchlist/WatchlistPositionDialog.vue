<template>
  <div class="position-overlay" @click.self="$emit('close')">
    <form
      ref="formEl"
      class="position-dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="dialog.assetType === 'stock' ? '录入股票持仓' : '录入基金持有'"
      @submit.prevent="$emit('save')"
      @click.stop
      @keydown="$emit('keydown', $event)"
    >
      <header class="position-dialog-header">
        <h3>{{ dialog.assetType === 'stock' ? '录入股票持仓' : '录入基金持有' }}</h3>
        <button class="position-close-btn" type="button" aria-label="关闭持仓录入" title="关闭" @click="$emit('close')">
          <X :size="15" aria-hidden="true" />
        </button>
      </header>
      <div v-if="dialog.assetType === 'stock'" class="position-fields">
        <label class="position-field">
          <span>成本价</span>
          <input v-model="dialog.stockCostPrice" type="number" min="0" step="0.001" inputmode="decimal" />
        </label>
        <label class="position-field">
          <span>股数</span>
          <input v-model="dialog.stockShares" type="number" min="0" step="1" inputmode="decimal" />
        </label>
      </div>
      <div v-else class="position-fields">
        <label class="position-field">
          <span>持有金额</span>
          <input v-model="dialog.fundHoldingAmount" type="number" min="0" step="0.01" inputmode="decimal" />
        </label>
        <label class="position-field">
          <span>收益</span>
          <input v-model="dialog.fundProfit" type="number" step="0.01" inputmode="decimal" />
        </label>
      </div>
      <p v-if="dialog.error" class="position-error">{{ dialog.error }}</p>
      <footer class="position-dialog-actions">
        <button class="position-secondary-btn" type="button" @click="$emit('clear')">清除</button>
        <button class="position-primary-btn" type="submit">保存</button>
      </footer>
    </form>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { X } from 'lucide-vue-next'

export interface WatchlistPositionDialogModel {
  assetType: string
  stockCostPrice: string
  stockShares: string
  fundHoldingAmount: string
  fundProfit: string
  error: string
}

defineProps<{
  dialog: WatchlistPositionDialogModel
}>()

defineEmits<{
  close: []
  save: []
  clear: []
  keydown: [event: KeyboardEvent]
}>()

const formEl = ref<HTMLElement | null>(null)
defineExpose({ formEl })
</script>

<style scoped>
.position-overlay{position:absolute;inset:0;z-index:45;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.44)}
.position-dialog{width:min(250px,100%);padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.35);display:flex;flex-direction:column;gap:12px}
.position-dialog-header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.position-dialog-header h3{margin:0;font-size:14px;line-height:1.2;color:var(--text-primary)}
.position-close-btn{width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer}
.position-close-btn:hover{background:rgba(255,255,255,.06);color:var(--text-primary)}
.position-fields{display:flex;flex-direction:column;gap:9px}
.position-field{display:flex;flex-direction:column;gap:5px;font-size:12px;color:var(--text-muted)}
.position-field input{height:30px;padding:0 9px;border:1px solid rgba(255,255,255,.10);border-radius:8px;background:rgba(255,255,255,.04);color:var(--text-primary);font-size:13px;outline:none}
.position-field input:focus{border-color:rgba(59,130,246,.45);background:rgba(255,255,255,.06)}
.position-error{margin:0;color:#fca5a5;font-size:12px}
.position-dialog-actions{display:flex;justify-content:flex-end;gap:8px}
.position-secondary-btn,.position-primary-btn{height:30px;padding:0 12px;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}
.position-secondary-btn{background:rgba(255,255,255,.06);color:var(--text-secondary)}
.position-primary-btn{background:rgba(45,124,246,.82);color:#fff}
</style>
