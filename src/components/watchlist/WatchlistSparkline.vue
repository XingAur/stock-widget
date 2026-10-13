<template>
  <div v-if="model.points" class="watchlist-sparkline" role="img" :aria-label="label" :title="label">
    <svg class="cl-spark" :class="tone === 'up' ? 'cl-spark--rise' : 'cl-spark--fall'" viewBox="0 0 120 24" preserveAspectRatio="none" aria-hidden="true">
      <line v-if="model.referenceY !== null" class="cl-spark__ref sparkline-zero-line" x1="2" x2="118" :y1="model.referenceY" :y2="model.referenceY" />
      <polyline class="cl-spark__line sparkline-line" :points="model.points" />
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
/* 线条、参考虚线的颜色与线宽来自 coolove-ui 的 .cl-spark（涨跌色跟随 data-trend） */
.watchlist-sparkline{position:relative;display:block;width:100%;height:100%;min-width:0}
</style>
