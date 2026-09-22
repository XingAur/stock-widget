<template>
  <div v-if="visible" class="import-overlay" @click.self="$emit('close')">
    <div
      ref="dialogElement"
      class="import-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="图片导入持仓"
      @click.stop
      @keydown="handleKeydown"
    >
      <header class="import-header">
        <h3>图片导入</h3>
        <button class="import-close-btn" type="button" aria-label="关闭导入" title="关闭" @click="$emit('close')">
          <X :size="15" aria-hidden="true" />
        </button>
      </header>

      <div class="import-body">
        <div v-if="resolving" class="import-status">正在识别与匹配…</div>
        <div v-else-if="entries.length === 0" class="import-status">
          未识别到股票代码或基金名称，换一张更清晰的截图试试
        </div>

        <template v-else>
          <label
            v-for="entry in entries"
            :key="entry.key"
            class="import-row"
            :class="[entry.status, { disabled: entry.status !== 'ready' }]"
          >
            <input
              v-model="entry.checked"
              type="checkbox"
              :disabled="entry.status !== 'ready'"
            />
            <span class="import-type" :class="entry.type">{{ entry.type === 'stock' ? '股' : '基' }}</span>
            <span class="import-name" :title="entry.displayName">{{ entry.displayName }}</span>
            <span class="import-meta">{{ statusText(entry) }}</span>
          </label>
        </template>

        <p v-if="error" class="import-error">{{ error }}</p>
      </div>

      <footer class="import-actions">
        <span class="import-summary">{{ summaryText }}</span>
        <button class="import-secondary-btn" type="button" @click="$emit('close')">取消</button>
        <button
          class="import-primary-btn"
          type="button"
          :disabled="resolving || selectedCount === 0 || importing"
          @click="runImport"
        >
          {{ importing ? '导入中…' : `导入 ${selectedCount} 项` }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { searchFunds } from '../api/stock'
import { useStockStore } from '../stores/stock'
import { parseOcrLines } from '../utils/ocrParse'
import { focusFirstModalControl, trapModalFocus } from '../utils/modalFocus'

type EntryStatus = 'ready' | 'exists' | 'unmatched'

interface ImportEntry {
  key: string
  type: 'stock' | 'fund'
  displayName: string
  code: string
  status: EntryStatus
  checked: boolean
}

const props = defineProps<{
  visible: boolean
  lines: string[]
}>()

const emit = defineEmits<{
  close: []
  imported: [summary: string]
}>()

const stockStore = useStockStore()
const dialogElement = ref<HTMLElement | null>(null)
const entries = ref<ImportEntry[]>([])
const resolving = ref(false)
const importing = ref(false)
const error = ref('')

const selectedCount = computed(() => entries.value.filter((entry) => entry.checked && entry.status === 'ready').length)
const summaryText = computed(() => {
  const ready = entries.value.filter((entry) => entry.status === 'ready').length
  const exists = entries.value.filter((entry) => entry.status === 'exists').length
  const unmatched = entries.value.filter((entry) => entry.status === 'unmatched').length
  const parts = [`可导入 ${ready}`]
  if (exists > 0) {
    parts.push(`已存在 ${exists}`)
  }
  if (unmatched > 0) {
    parts.push(`未匹配 ${unmatched}`)
  }
  return parts.join(' · ')
})

function statusText(entry: ImportEntry): string {
  if (entry.status === 'exists') {
    return '已存在'
  }
  return entry.status === 'unmatched' ? '未匹配' : entry.code
}

async function resolve(): Promise<void> {
  const parsed = parseOcrLines(props.lines)
  const nextEntries: ImportEntry[] = []

  for (const stock of parsed.stocks) {
    const exists = stockStore.watchList.includes(stock.code)
    nextEntries.push({
      key: `stock-${stock.code}`,
      type: 'stock',
      displayName: stock.name || stock.code,
      code: stock.code,
      status: exists ? 'exists' : 'ready',
      checked: !exists
    })
  }

  resolving.value = parsed.funds.length > 0
  await nextTick(() => focusFirstModalControl(dialogElement.value))

  // 基金截图只有名称：逐个反查代码（搜索结果按相关度排序，取第一个）
  await Promise.all(parsed.funds.map(async (fund) => {
    const unmatched: ImportEntry = {
      key: `fund-${fund.name}`,
      type: 'fund',
      displayName: fund.name,
      code: '',
      status: 'unmatched',
      checked: false
    }
    try {
      const results = await searchFunds(fund.name)
      const matched = results[0]
      if (!matched) {
        nextEntries.push(unmatched)
        return
      }

      const exists = stockStore.fundWatchList.includes(matched.code)
      nextEntries.push({
        key: `fund-${matched.code}`,
        type: 'fund',
        displayName: matched.name,
        code: matched.code,
        status: exists ? 'exists' : 'ready',
        checked: !exists
      })
    } catch {
      nextEntries.push(unmatched)
    }
  }))

  entries.value = nextEntries
  resolving.value = false
}

async function runImport(): Promise<void> {
  const selected = entries.value.filter((entry) => entry.checked && entry.status === 'ready')
  if (selected.length === 0 || importing.value) {
    return
  }

  importing.value = true
  error.value = ''
  let imported = 0
  try {
    for (const entry of selected) {
      const succeeded = entry.type === 'stock'
        ? await stockStore.addStock(entry.code)
        : await stockStore.addFund(entry.code)
      if (succeeded) {
        imported += 1
      }
    }

    emit('imported', `已导入 ${imported}/${selected.length} 项`)
    emit('close')
  } catch (caught) {
    error.value = caught instanceof Error ? caught.message : String(caught)
  } finally {
    importing.value = false
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    emit('close')
    return
  }
  trapModalFocus(event, dialogElement.value)
}

watch(() => props.visible, (visible) => {
  if (visible) {
    entries.value = []
    error.value = ''
    void resolve()
  }
})

onMounted(() => {
  if (props.visible) {
    void resolve()
  }
})
</script>

<style scoped>
.import-overlay{position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(0,0,0,.44)}
.import-dialog{width:min(260px,100%);max-height:100%;display:flex;flex-direction:column;padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 18px 48px rgba(0,0,0,.35)}
.import-header{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px}
.import-header h3{margin:0;font-size:14px;color:var(--text-primary)}
.import-close-btn{width:24px;height:24px;border:none;border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;font-size:18px;line-height:1}
.import-close-btn:hover{background:rgba(255,255,255,.06);color:var(--text-primary)}
.import-body{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:4px}
.import-status{padding:18px 4px;color:var(--text-muted);font-size:12px;text-align:center}
.import-row{display:flex;align-items:center;gap:7px;padding:6px 7px;border-radius:8px;background:rgba(255,255,255,.03);cursor:pointer}
.import-row:hover{background:rgba(255,255,255,.055)}
.import-row.disabled{opacity:.55;cursor:not-allowed}
.import-row input{flex:0 0 auto;accent-color:#2d7cf6}
.import-type{flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:5px;font-size:10px;font-weight:800}
.import-type.stock{background:rgba(45,124,246,.2);color:#7bb3ff}
.import-type.fund{background:rgba(245,158,11,.2);color:#f5b45f}
.import-name{flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.import-meta{flex:0 0 auto;font-size:10px;color:var(--text-muted);white-space:nowrap}
.import-row.exists .import-meta{color:#fbbf57}
.import-row.unmatched .import-meta{color:#ff8c8c}
.import-error{margin:8px 0 0;color:#fca5a5;font-size:12px}
.import-actions{display:flex;align-items:center;gap:8px;margin-top:12px}
.import-summary{flex:1;min-width:0;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.import-secondary-btn,.import-primary-btn{height:30px;padding:0 12px;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer}
.import-secondary-btn{background:rgba(255,255,255,.06);color:var(--text-secondary)}
.import-primary-btn{background:rgba(45,124,246,.82);color:#fff}
.import-primary-btn:disabled{opacity:.5;cursor:not-allowed}
.import-secondary-btn:hover{background:rgba(255,255,255,.1);color:var(--text-primary)}
.import-primary-btn:not(:disabled):hover{background:rgba(45,124,246,.94)}
</style>
