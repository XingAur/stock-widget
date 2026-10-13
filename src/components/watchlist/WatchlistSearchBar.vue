<template>
  <div class="cl-search search-shell">
    <div v-if="error" class="cl-search__message cl-search__message--danger search-error" role="alert">{{ error }}</div>
    <div class="cl-input-wrap">
      <span class="cl-input-wrap__prefix search-icon"><Search aria-hidden="true" /></span>
      <input
        class="cl-input cl-input--sm"
        :value="query"
        type="text"
        :placeholder="placeholder"
        :aria-label="placeholder"
        @input="$emit('update:query', ($event.target as HTMLInputElement).value); $emit('input')"
        @focus="$emit('focus')"
        @blur="$emit('blur')"
        @keydown.enter.prevent="$emit('enter')"
      />
    </div>
    <div v-if="showResults && results.length > 0" class="cl-search__results cl-search__results--up search-results search-results-top">
      <button
        v-for="item in results"
        :key="item.code"
        class="cl-search__item search-item"
        type="button"
        @mousedown.prevent="$emit('select', item.code)"
      >
        <span class="cl-search__name search-name">{{ item.name }}</span>
        <span class="cl-search__code search-code">{{ item.code }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Search } from 'lucide-vue-next'

defineProps<{
  query: string
  placeholder: string
  error: string
  showResults: boolean
  results: { code: string; name: string }[]
}>()

defineEmits<{
  'update:query': [value: string]
  input: []
  focus: []
  blur: []
  enter: []
  select: [code: string]
}>()
</script>
