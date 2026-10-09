<template>
  <div v-if="model.points" class="watchlist-sparkline" role="img" :aria-label="label" :title="label">
    <svg viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
      <line v-if="model.referenceY !== null" class="sparkline-zero-line" x1="2" x2="118" :y1="model.referenceY" :y2="model.referenceY" />
      <polyline class="sparkline-line" :class="tone" :points="model.points" />
    </svg>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { createReferenceSparkline } from '../../utils/chart'
const props = defineProps<{ prices: readonly number[]; reference: number | null; tone: 'up' | 'down'; label: string }>()
const model = computed(() => createReferenceSparkline(props.prices, props.reference))
</script>

<style scoped>
.watchlist-sparkline{position:relative;display:block;width:100%;height:24px;min-width:0}
.watchlist-sparkline svg{display:block;width:100%;height:100%}
.sparkline-line{fill:none;stroke-width:1.1;stroke-linecap:round;stroke-linejoin:round;vector-effect:non-scaling-stroke}
.sparkline-line.up{stroke:var(--danger,#ff7b7b)}
.sparkline-line.down{stroke:var(--success,#39cf84)}
.sparkline-zero-line{stroke:var(--text-secondary);stroke-width:.65;stroke-dasharray:3 3;opacity:.6;vector-effect:non-scaling-stroke}
:global([data-theme="light"] .watchlist-sparkline .sparkline-zero-line){opacity:.4}
</style>
