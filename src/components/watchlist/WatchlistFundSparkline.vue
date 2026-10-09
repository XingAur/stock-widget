<template>
  <WatchlistSparkline v-if="prices.length >= 2" class="fund-sparkline" :prices="prices" :reference="prices[0]" :tone="prices[prices.length - 1] >= prices[0] ? 'up' : 'down'" label="近20个交易日净值走势，虚线表示区间首日净值；右侧涨幅为当日涨幅" />
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { fetchFundHistory, type FundNavPoint } from '../../api/stock'
import { readFundDetailCache, shouldRefreshFundHistory, writeFundDetailCache } from '../../utils/fundCache'
import WatchlistSparkline from './WatchlistSparkline.vue'

const props = defineProps<{ code: string; navDate: string }>()
const history = ref<FundNavPoint[]>([])
const prices = computed(() => [...history.value]
  .filter((point) => Number.isFinite(point.nav) && point.nav > 0)
  .sort((left, right) => left.date.localeCompare(right.date))
  .slice(-21)
  .map((point) => point.nav))
let requestId = 0
watch(() => [props.code, props.navDate], async () => {
  const request = ++requestId
  const code = props.code
  const cache = readFundDetailCache<FundNavPoint[]>('history-v2', code, 6 * 60 * 60 * 1000)
  history.value = cache?.value ?? []
  if (!shouldRefreshFundHistory(cache, props.navDate)) return
  try {
    const points = await fetchFundHistory(code)
    if (request !== requestId) return
    history.value = points
    if (points.length > 0) writeFundDetailCache('history-v2', code, points)
  } catch {
    // 保留真实历史缓存；净值历史不可用时不阻塞列表。
  }
}, { immediate: true })
</script>

<style scoped>
.fund-sparkline{flex:1;width:100%;max-width:120px;height:24px}
</style>
