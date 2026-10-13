<template>
  <div class="search-shell">
    <div v-if="error" class="search-error" role="alert">{{ error }}</div>
    <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="20" y1="20" x2="16.65" y2="16.65" />
    </svg>
    <input
      :value="query"
      type="text"
      :placeholder="placeholder"
      @input="$emit('update:query', ($event.target as HTMLInputElement).value); $emit('input')"
      @focus="$emit('focus')"
      @blur="$emit('blur')"
      @keydown.enter.prevent="$emit('enter')"
    />
    <div v-if="showResults && results.length > 0" class="search-results search-results-top">
      <button
        v-for="item in results"
        :key="item.code"
        class="search-item"
        type="button"
        @mousedown.prevent="$emit('select', item.code)"
      >
        <span class="search-name">{{ item.name }}</span>
        <span class="search-code">{{ item.code }}</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
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

<style scoped>
.search-shell{position:relative;min-width:0;width:100%}
.search-shell input{width:100%;min-width:0;height:26px;padding:0 8px 0 28px;border:1px solid rgba(255,255,255,.08);border-radius:8px;outline:none;background:rgba(255,255,255,.03);color:var(--text-primary);font-size:12px}
.search-shell input::placeholder{color:var(--text-muted)}
.search-shell input:focus{border-color:rgba(59,130,246,.4);background:rgba(255,255,255,.045)}
.search-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--text-muted);pointer-events:none}
.search-error{position:absolute;bottom:calc(100% + 8px);left:0;z-index:11;padding:7px 10px;border:1px solid rgba(248,113,113,.3);border-radius:8px;background:var(--solid-bg);color:#ff9c9c;font-size:12px;white-space:nowrap}
.search-results{position:absolute;bottom:calc(100% + 8px);left:0;z-index:10;padding:6px;border:1px solid var(--border-color);border-radius:12px;background:var(--solid-bg);box-shadow:0 20px 48px rgba(0,0,0,.34);min-width:220px}
.search-item{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:9px 12px;border:none;border-radius:8px;background:transparent;color:var(--text-primary);cursor:pointer;white-space:nowrap;min-width:208px}
.search-item:hover{background:rgba(255,255,255,.05)}
.search-name{font-size:13px;font-weight:600}.search-code{font-size:12px;color:var(--text-muted)}
</style>
