<template>
  <div class="stock-item" :class="{ positive: stock.changePercent >= 0, negative: stock.changePercent < 0 }">
    <div class="stock-info">
      <div class="stock-name">{{ stock.name }}</div>
      <div class="stock-code">{{ stock.code }}</div>
    </div>
    <div class="stock-price">
      <div class="price">{{ stock.price.toFixed(2) }}</div>
      <div class="change" :class="{ up: stock.changePercent >= 0, down: stock.changePercent < 0 }">
        {{ formatChange(stock.change, stock.changePercent) }}
      </div>
    </div>
    <button class="remove-btn" @click.stop="$emit('remove')" title="删除">×</button>
  </div>
</template>

<script setup lang="ts">
import type { Stock } from '../api/stock'

defineProps<{
  stock: Stock
}>()

defineEmits<{
  remove: []
}>()

function formatChange(change: number, percent: number): string {
  const sign = change >= 0 ? '+' : ''
  return `${sign}${percent.toFixed(2)}%`
}
</script>

<style scoped>
.stock-item {
  display: flex;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  transition: background 0.15s ease;
  position: relative;
  border-bottom: 1px solid var(--border-color);
}

.stock-item:hover {
  background: rgba(255, 255, 255, 0.05);
}

.stock-item:last-child {
  border-bottom: none;
}

.stock-info {
  flex: 1;
  min-width: 0;
}

.stock-name {
  font-size: 15px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-code {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.stock-price {
  text-align: right;
  margin-right: 8px;
}

.price {
  font-size: 16px;
  font-weight: 600;
}

.change {
  font-size: 12px;
  margin-top: 2px;
}

.change.up {
  color: var(--success);
}

.change.down {
  color: var(--danger);
}

.positive .price {
  color: var(--success);
}

.negative .price {
  color: var(--danger);
}

.remove-btn {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted);
  font-size: 14px;
  cursor: pointer;
  opacity: 0;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.stock-item:hover .remove-btn {
  opacity: 1;
}

.remove-btn:hover {
  background: rgba(255, 59, 48, 0.2);
  color: var(--danger);
}
</style>