<template>
  <div v-if="visible" class="cl-backdrop cl-backdrop--contained import-overlay" @click.self="$emit('close')">
    <div
      ref="dialogElement"
      class="cl-dialog cl-dialog--xs import-dialog"
      role="dialog"
      aria-modal="true"
      aria-label="图片导入持仓"
      @click.stop
      @keydown="handleKeydown"
    >
      <header class="cl-dialog__head import-header">
        <h3 class="cl-dialog__title">图片导入</h3>
        <button class="cl-close import-close-btn" type="button" aria-label="关闭导入" title="关闭" @click="$emit('close')">
          <X aria-hidden="true" />
        </button>
      </header>

      <div class="cl-dialog__body cl-list cl-list--flush import-body">
        <div v-if="resolving" class="cl-empty import-status"><span class="cl-spinner"></span>正在识别与匹配…</div>
        <div v-else-if="entries.length === 0" class="cl-empty import-status">
          <span class="cl-empty__desc">未识别到股票代码或基金名称，换一张更清晰的截图试试</span>
        </div>

        <template v-else>
          <label
            v-for="entry in entries"
            :key="entry.key"
            class="cl-card import-row"
            :class="[entry.status, { disabled: entry.status !== 'ready' }]"
          >
            <span class="cl-check">
              <input
                v-model="entry.checked"
                type="checkbox"
                :aria-label="entry.displayName"
                :disabled="entry.status !== 'ready'"
              />
            </span>
            <span class="cl-tile cl-tile--sm import-type" :class="[entry.type, entry.type === 'fund' ? 'cl-tile--warning' : '']">{{ entry.type === 'stock' ? '股' : '基' }}</span>
            <span class="cl-card__title import-name" :title="entry.displayName">{{ entry.displayName }}</span>
            <span class="cl-card__meta import-meta">{{ statusText(entry) }}</span>
          </label>
        </template>

        <p v-if="error" class="cl-field__error import-error" role="alert">{{ error }}</p>
      </div>

      <footer class="cl-dialog__foot import-actions">
        <span class="import-summary">{{ summaryText }}</span>
        <button class="cl-btn cl-btn--ghost import-secondary-btn" type="button" @click="$emit('close')">取消</button>
        <button
          class="cl-btn cl-btn--primary import-primary-btn"
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
import { fetchStocks, searchFunds } from '../api/stock'
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

  // OCR 的股票名经常残缺（水印干扰只剩单字），批量拉行情用正式名称展示
  const officialNames = new Map<string, string>()
  if (parsed.stocks.length > 0) {
    resolving.value = true
    await nextTick(() => focusFirstModalControl(dialogElement.value))
    try {
      const quotes = await fetchStocks(parsed.stocks.map((stock) => stock.code))
      quotes.forEach((quote) => officialNames.set(quote.code, quote.name))
    } catch {
      // 拉不到正式名称时退回 OCR 名称
    }
  }

  for (const stock of parsed.stocks) {
    const exists = stockStore.watchList.includes(stock.code)
    const officialName = officialNames.get(stock.code)
    nextEntries.push({
      key: `stock-${stock.code}`,
      type: 'stock',
      displayName: officialName || stock.name || stock.code,
      code: stock.code,
      status: exists ? 'exists' : 'ready',
      checked: !exists
    })
  }

  resolving.value = parsed.funds.length > 0
  if (parsed.funds.length > 0 && !dialogElement.value) {
    await nextTick(() => focusFirstModalControl(dialogElement.value))
  }

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
.import-body{flex:1;min-height:0;overflow-y:auto;gap:4px}
.import-status{flex-direction:row;padding:18px 4px;font-size:var(--fs-sm)}
.import-row{min-height:32px;gap:7px;padding:6px 7px}
.import-row.disabled{opacity:.55;cursor:not-allowed}
.import-name{flex:1;max-width:none;font-size:var(--fs-sm);font-weight:600}
.import-meta{font-size:10px;font-weight:500}
.import-row.exists .import-meta{color:var(--c-amber)}
.import-row.unmatched .import-meta{color:var(--c-err-text)}
.import-summary{flex:1;min-width:0;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.import-actions{align-items:center}
</style>
