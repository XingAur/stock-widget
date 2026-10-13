<template>
  <div class="fund-account-summary">
    <div v-for="card in cards" :key="card.label" class="fund-account-card">
      <span>{{ card.label }}</span>
      <strong :class="card.toneClass" :title="card.title">{{ card.value }}</strong>
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  cards: { label: string; value: string; title: string; toneClass?: string }[]
}>()
</script>

<style scoped>
.fund-account-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-bottom:2px}
.fund-account-card{min-width:0;padding:8px 7px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.04);box-shadow:inset 0 1px 0 rgba(255,255,255,.035)}
.fund-account-card span{display:block;margin-bottom:5px;font-size:10px;line-height:1;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fund-account-card strong{display:block;min-width:0;font-size:12px;line-height:1.05;font-weight:900;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fund-account-card strong.position-profit{color:#ff7474}
.fund-account-card strong.position-loss{color:#3ad283}
.fund-account-card strong.position-flat{color:var(--text-secondary)}
</style>
