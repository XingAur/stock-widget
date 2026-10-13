<template>
  <div class="cl-stat-grid fund-account-summary">
    <div v-for="card in cards" :key="card.label" class="cl-stat cl-stat--compact fund-account-card">
      <span class="cl-stat__label">{{ card.label }}</span>
      <strong class="cl-stat__value" :class="toneOf(card.toneClass)" :title="card.title">{{ card.value }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cards: { label: string; value: string; title: string; toneClass?: string }[]
}>()

// Home 传入的是 position-profit / position-loss / position-flat
function toneOf(toneClass?: string): string {
  if (toneClass === 'position-profit') return 'cl-rise'
  if (toneClass === 'position-loss') return 'cl-fall'
  return toneClass === 'position-flat' ? 'cl-secondary' : ''
}
</script>

<style scoped>
.fund-account-summary{margin-bottom:2px}
</style>
