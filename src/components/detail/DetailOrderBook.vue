<template>
  <aside class="orderbook-panel">
    <div class="orderbook-section">
      <div v-for="row in sellRows" :key="row.label" class="orderbook-row" :class="[row.side, tone]">
        <i class="orderbook-depth sell" :style="{ width: row.depthPercent + '%' }" />
        <span class="orderbook-level">{{ row.label }}</span>
        <strong class="orderbook-price">{{ row.priceText }}</strong>
        <span class="orderbook-volume">{{ row.volumeText }}</span>
      </div>
    </div>
    <div class="orderbook-divider" aria-hidden="true">
      <i class="buy" :style="{ width: buyPercent + '%' }" />
      <i class="sell" :style="{ width: sellPercent + '%' }" />
    </div>
    <div class="orderbook-section">
      <div v-for="row in buyRows" :key="row.label" class="orderbook-row" :class="[row.side, tone]">
        <i class="orderbook-depth buy" :style="{ width: row.depthPercent + '%' }" />
        <span class="orderbook-level">{{ row.label }}</span>
        <strong class="orderbook-price">{{ row.priceText }}</strong>
        <span class="orderbook-volume">{{ row.volumeText }}</span>
      </div>
    </div>
  </aside>
</template>

<script setup lang="ts">
defineProps<{
  sellRows: { label: string; priceText: string; volumeText: string; side: string; depthPercent: number }[]
  buyRows: { label: string; priceText: string; volumeText: string; side: string; depthPercent: number }[]
  tone: string
  buyPercent: number
  sellPercent: number
}>()
</script>

<style scoped>
.orderbook-panel{width:160px;flex:0 0 160px;min-height:0;padding:12px 0 0 14px;border-left:1px solid var(--divider-color);display:flex;flex-direction:column;gap:8px}
.orderbook-row{position:relative;isolation:isolate;display:grid;grid-template-columns:28px 1fr auto;align-items:center;column-gap:10px;overflow:hidden;min-height:24px;font-size:var(--fs-sm);font-variant-numeric:tabular-nums}
.orderbook-row>span,.orderbook-row>strong{position:relative;z-index:1}
/* 深度条：卖盘用“跌”色、买盘用“涨”色，跟随 data-trend */
.orderbook-depth{position:absolute;z-index:0;top:50%;right:0;height:18px;transform:translateY(-50%);opacity:.48;pointer-events:none}
.orderbook-depth.sell{background:color-mix(in srgb,var(--fall-strong) 62%,transparent)}
.orderbook-depth.buy{background:color-mix(in srgb,var(--rise-strong) 58%,transparent)}
.orderbook-section{flex:1;min-height:0;display:grid;grid-template-rows:repeat(5,minmax(24px,1fr));gap:4px}
.orderbook-level{color:var(--text-secondary)}
.orderbook-price{font-weight:700;text-align:left;color:var(--text-primary)}
.orderbook-volume{text-align:right;color:var(--text-secondary)}
.orderbook-row.up .orderbook-price{color:var(--rise)}
.orderbook-row.down .orderbook-price{color:var(--fall)}
.orderbook-divider{display:flex;flex:0 0 3px;height:3px;overflow:hidden;margin:1px 0;background:var(--surface-3)}
.orderbook-divider i{display:block;height:100%}
.orderbook-divider .buy{background:var(--rise-strong)}
.orderbook-divider .sell{background:var(--fall-strong)}
@media (max-width:1200px){.orderbook-panel{width:148px;flex-basis:148px;padding-left:12px}}
</style>
