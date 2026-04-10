<template>
  <div class="search-box" :class="{ focused: isFocused }">
    <span class="search-icon">🔍</span>
    <input
      ref="inputRef"
      v-model="keyword"
      type="text"
      placeholder="搜索股票代码或名称"
      @focus="isFocused = true"
      @blur="handleBlur"
      @input="handleSearch"
      @keydown.enter="handleEnter"
      @keydown.down="selectNext"
      @keydown.up="selectPrev"
      @keydown.esc="closeResults"
    />
    <button v-if="keyword" class="clear-btn" @click="clear">×</button>
  </div>
  <div v-if="showResults && results.length > 0" class="search-results">
    <div
      v-for="(item, index) in results"
      :key="item.code"
      class="result-item"
      :class="{ selected: index === selectedIndex }"
      @mousedown="selectItem(item)"
    >
      <span class="result-name">{{ item.name }}</span>
      <span class="result-code">{{ item.code }}</span>
      <span class="result-market">{{ item.market }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { searchStock, type SearchResult } from '../api/stock'

const emit = defineEmits<{
  select: [code: string]
}>()

const inputRef = ref<HTMLInputElement>()
const keyword = ref('')
const isFocused = ref(false)
const showResults = ref(false)
const results = ref<SearchResult[]>([])
const selectedIndex = ref(0)
let searchTimer: number | null = null

async function handleSearch() {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }

  if (!keyword.value.trim()) {
    results.value = []
    showResults.value = false
    return
  }

  searchTimer = window.setTimeout(async () => {
    const data = await searchStock(keyword.value.trim())
    results.value = data
    showResults.value = data.length > 0
    selectedIndex.value = 0
  }, 300)
}

function handleBlur() {
  isFocused.value = false
  setTimeout(() => {
    showResults.value = false
  }, 200)
}

function clear() {
  keyword.value = ''
  results.value = []
  showResults.value = false
}

function selectItem(item: SearchResult) {
  emit('select', item.code)
  clear()
}

function handleEnter() {
  if (results.value.length > 0 && selectedIndex.value >= 0) {
    selectItem(results.value[selectedIndex.value])
  }
}

function selectNext() {
  if (selectedIndex.value < results.value.length - 1) {
    selectedIndex.value++
  }
}

function selectPrev() {
  if (selectedIndex.value > 0) {
    selectedIndex.value--
  }
}

function closeResults() {
  showResults.value = false
}

onMounted(() => {
  inputRef.value?.focus()
})

onUnmounted(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
  }
})
</script>

<style scoped>
.search-box {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.search-box.focused {
  border-color: var(--text-secondary);
  background: rgba(255, 255, 255, 0.08);
}

.search-icon {
  margin-right: 8px;
  font-size: 14px;
  opacity: 0.6;
}

.search-box input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 14px;
  color: var(--text-primary);
}

.search-box input::placeholder {
  color: var(--text-muted);
}

.clear-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
}

.clear-btn:hover {
  color: var(--text-primary);
}

.search-results {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 100%;
  margin-bottom: 4px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.result-item {
  display: flex;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s ease;
}

.result-item:hover,
.result-item.selected {
  background: rgba(255, 255, 255, 0.1);
}

.result-name {
  flex: 1;
  color: var(--text-primary);
}

.result-code {
  color: var(--text-secondary);
  margin-right: 12px;
}

.result-market {
  color: var(--text-muted);
  font-size: 12px;
}
</style>