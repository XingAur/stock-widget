<template>
  <div class="mini-widget" v-if="stocks.length > 0" @click="$emit('restore')">
    <div class="mini-content">
      <span class="mini-name">{{ currentStock.name }}</span>
      <span class="mini-price" :class="{ up: currentStock.changePercent >= 0, down: currentStock.changePercent < 0 }">
        {{ currentStock.price.toFixed(2) }}
      </span>
      <span class="mini-change" :class="{ up: currentStock.changePercent >= 0, down: currentStock.changePercent < 0 }">
        {{ formatPercent(currentStock.changePercent) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useStockStore } from '../stores/stock'

defineEmits<{
  restore: []
}>()

const stockStore = useStockStore()
const currentIndex = ref(0)
let carouselTimer: number | null = null

const stocks = computed(() => stockStore.stockList)

const currentStock = computed(() => {
  const stock = stocks.value[currentIndex.value]
  return stock || { name: '', price: 0, changePercent: 0 }
})

function formatPercent(percent: number): string {
  const sign = percent >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}

function nextStock() {
  if (stocks.value.length > 0) {
    currentIndex.value = (currentIndex.value + 1) % stocks.value.length
  }
}

function startCarousel() {
  stopCarousel()
  carouselTimer = window.setInterval(() => {
    nextStock()
  }, 3000)
}

function stopCarousel() {
  if (carouselTimer) {
    clearInterval(carouselTimer)
    carouselTimer = null
  }
}

onMounted(() => {
  startCarousel()
})

onUnmounted(() => {
  stopCarousel()
})
</script>

<style scoped>
.mini-widget {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.mini-content {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 16px;
}

.mini-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--text-primary);
}

.mini-price {
  font-size: 16px;
  font-weight: 600;
}

.mini-change {
  font-size: 13px;
}

.up {
  color: var(--success);
}

.down {
  color: var(--danger);
}
</style>