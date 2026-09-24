<template>
  <div class="quant-view">
    <div class="quant-header">
      <span class="quant-title">量化 · 自选池</span>
      <span class="quant-sub">{{ summaryText }}</span>
      <button class="quant-refresh" type="button" title="重新计算" @click="reload">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="23 4 23 10 17 10" />
          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
        </svg>
      </button>
    </div>

    <div class="quant-body">
      <div v-if="loading" class="quant-empty">正在拉取 K 线与计算因子…</div>
      <div v-else-if="rows.length === 0" class="quant-empty">
        <p>自选列表暂无股票</p>
        <span>添加股票自选后即可评分</span>
      </div>

      <template v-else>
        <section class="quant-section">
          <h4>因子评分<span>（0.7×动量20 + 0.3×反转5，截面分）</span></h4>
          <div
            v-for="row in rows"
            :key="row.code"
            class="quant-row"
            :class="{ active: row.rank > 0 && row.rank <= 3 }"
          >
            <span class="quant-rank">{{ row.rank > 0 ? row.rank : '-' }}</span>
            <span class="quant-name" :title="row.name">{{ row.name }}</span>
            <span class="quant-mom" :class="tone(row.mom20)">{{ percent(row.mom20) }}</span>
            <span class="quant-score" :class="scoreTone(row.composite)">{{ scoreText(row.composite) }}</span>
          </div>
        </section>

        <section class="quant-section">
          <h4>
            持仓对照
            <div class="target-switch" role="group" aria-label="目标权重模式">
              <button type="button" :class="{ active: targetMode === 'equal' }" @click="switchTargetMode('equal')">等权</button>
              <button type="button" :class="{ active: targetMode === 'score' }" @click="switchTargetMode('score')">评分加权</button>
            </div>
            <label class="quant-assets">
              总资金
              <input
                v-model="totalAssetsInput"
                type="number"
                min="0"
                step="1"
                placeholder="万"
                title="账户总资金（万元，含现金）。填写后按总资产口径对照；留空则按股票持仓内部占比"
                @change="saveTotalAssets"
                @keydown.stop
              >
              万
            </label>
          </h4>
          <div v-if="holdingRows.length === 0" class="quant-hint">尚未录入持仓：右键自选卡片可录入成本与股数</div>
          <div v-else-if="!totalAssetsInput" class="quant-hint">未填总资金：金额按已录持仓市值折算；填写后按总资产口径并显示建议买入金额</div>
          <div v-else-if="cashRow" class="quant-hold cash">
            <span class="quant-name">现金</span>
            <div class="quant-bars"><div class="quant-bar current" :style="{ width: `${Math.min(100, cashRow.percent)}%` }" /></div>
            <span class="quant-drift">{{ cashRow.text }}<i>{{ amountText(cashRow.amount) }}</i></span>
          </div>
          <div v-for="row in holdingRows" :key="row.code" class="quant-hold">
            <span class="quant-name" :title="row.name">{{ row.name }}</span>
            <div class="quant-bars">
              <div class="quant-bar target" :style="{ width: `${row.targetPercent}%` }" />
              <div class="quant-bar current" :style="{ width: `${row.currentPercent}%` }" />
            </div>
            <span class="quant-drift" :class="driftTone(row.drift)">
              {{ driftText(row.drift, row.held) }}
              <i>{{ amountText(row.driftAmount) }}</i>
            </span>
          </div>
        </section>

        <section class="quant-section">
          <h4>组合回测<span>（等权持有 · A股规则 · 约{{ backtestYears }}年）</span></h4>
          <div v-if="backtest" class="quant-bt">
            <svg v-if="backtest.nav.length > 1" class="quant-nav" :viewBox="`0 0 240 60`" preserveAspectRatio="none">
              <polyline
                :points="navPoints"
                :class="backtest.totalReturn >= 0 ? 'nav-up' : 'nav-down'"
                fill="none"
                stroke-width="1.5"
              />
            </svg>
            <div class="quant-metrics">
              <div class="metric">
                <span>总收益</span>
                <strong :class="tone(backtest.totalReturn)">{{ percent(backtest.totalReturn) }}</strong>
              </div>
              <div class="metric">
                <span>年化</span>
                <strong :class="tone(backtest.annualizedReturn)">{{ percent(backtest.annualizedReturn) }}</strong>
              </div>
              <div class="metric">
                <span>最大回撤</span>
                <strong class="down">{{ percent(backtest.maxDrawdown) }}</strong>
              </div>
            </div>
            <p class="quant-hint">回测基于后复权日K与等权重平衡（含佣金/印花税/滑点/涨跌停约束），历史表现不代表未来。</p>
          </div>
        </section>
      </template>
    </div>

    <div class="quant-bottom">
      <button class="quant-back" type="button" title="返回自选" @click="goBack">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        返回自选
      </button>
      <span class="quant-updated">{{ updatedText }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStockStore } from '../stores/stock'
import { lastWatchlistViewType } from '../utils/market'
import { readPersistedSlice, updatePersistedSlice } from '../utils/persistence'
import { computeFactorRows, loadQuantKlineBundle, runEqualWeightBacktest, type BacktestResult, type FactorRow } from '../utils/quant'

interface HoldingRow {
  code: string
  name: string
  targetPercent: number
  currentPercent: number
  drift: number
  driftAmount: number | null
  held: boolean
}

const stockStore = useStockStore()
const rows = ref<(FactorRow & { name: string })[]>([])
const targetMode = ref<'equal' | 'score'>('equal')
const totalAssetsInput = ref('')
const cashRow = ref<{ percent: number; amount: number; text: string } | null>(null)
const holdingRows = ref<HoldingRow[]>([])
const backtest = ref<BacktestResult | null>(null)
const loading = ref(false)
const updatedAt = ref<Date | null>(null)

const summaryText = computed(() => `${rows.value.length} 只 · 评分前 3 高亮`)
const backtestYears = computed(() => (backtest.value ? Math.max(1, Math.round(backtest.value.nav.length / 244 * 10) / 10) : 0))
const updatedText = computed(() => (updatedAt.value
  ? `${String(updatedAt.value.getHours()).padStart(2, '0')}:${String(updatedAt.value.getMinutes()).padStart(2, '0')} 更新`
  : ''))

const navPoints = computed(() => {
  const nav = backtest.value?.nav ?? []
  if (nav.length < 2) {
    return ''
  }
  const values = nav.map((point) => point.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return nav
    .map((point, index) => `${(index / (nav.length - 1)) * 240},${60 - ((point.value - min) / span) * 56 - 2}`)
    .join(' ')
})

function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '--'
  }
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function tone(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value) || value === 0) {
    return ''
  }
  return value > 0 ? 'up' : 'down'
}

function scoreTone(value: number | null): string {
  if (value === null) {
    return ''
  }
  return value > 0.5 ? 'up' : value < -0.5 ? 'down' : ''
}

function scoreText(value: number | null): string {
  if (value === null) {
    return '--'
  }
  return value.toFixed(2)
}

function driftTone(drift: number): string {
  return Math.abs(drift) < 0.005 ? '' : drift > 0 ? 'down' : 'up'
}

/** 目标权重：等权 or 评分加权（线性映射保证为正，最强≈最弱数倍） */
function targetWeights(poolRows: FactorRow[], mode: 'equal' | 'score'): Map<string, number> {
  const weights = new Map<string, number>()
  const n = poolRows.length
  if (n === 0) {
    return weights
  }
  if (mode === 'equal') {
    const w = 1 / n
    poolRows.forEach((row) => weights.set(row.code, w))
    return weights
  }
  const scored = poolRows.filter((row) => row.composite !== null)
  if (scored.length < 2) {
    const w = 1 / n
    poolRows.forEach((row) => weights.set(row.code, w))
    return weights
  }
  const values = scored.map((row) => row.composite as number)
  const min = Math.min(...values)
  const raw = scored.map((row) => (row.composite as number) - min + 0.4)
  const total = raw.reduce((sum, value) => sum + value, 0)
  scored.forEach((row, index) => weights.set(row.code, raw[index] / total))
  const fallback = 0.2 / Math.max(n, 1)
  poolRows.forEach((row) => {
    if (!weights.has(row.code)) {
      weights.set(row.code, fallback)
    }
  })
  const sum = [...weights.values()].reduce((acc, value) => acc + value, 0)
  weights.forEach((value, key) => weights.set(key, value / sum))
  return weights
}

function amountText(amount: number | null): string {
  if (amount === null || !Number.isFinite(amount) || Math.abs(amount) < 1) {
    return ''
  }
  const abs = Math.abs(amount)
  const text = abs >= 10_000 ? `${(abs / 10_000).toFixed(abs >= 100_000 ? 0 : 1)}万` : abs.toFixed(0)
  return `¥${text}`
}

function driftText(drift: number, held: boolean): string {
  if (Math.abs(drift) < 0.005) {
    return '持平'
  }
  // 低于目标：有仓位是加仓，没仓位才是建仓
  const action = drift > 0 ? '减仓' : held ? '加仓' : '建仓'
  return `${action} ${Math.abs(drift * 100).toFixed(1)}%`
}

function displayName(code: string): string {
  const stock = stockStore.stocks.get(code)
  return stock?.name || code
}

async function reload(): Promise<void> {
  const codes = [...stockStore.watchList]
  if (codes.length === 0) {
    rows.value = []
    holdingRows.value = []
    backtest.value = null
    return
  }
  if (loading.value) {
    return
  }

  loading.value = true
  try {
    const bundle = await loadQuantKlineBundle(codes)
    const usable = Object.fromEntries(
      Object.entries(bundle.adjusted).filter(([, points]) => points.length >= 6)
    )
    const rawKlines = bundle.raw

    const factorRows = computeFactorRows(usable)
    rows.value = factorRows.map((row) => ({ ...row, name: displayName(row.code) }))
    backtest.value = runEqualWeightBacktest(usable)

    // 持仓对照：填了总资金按总资产口径（含现金与未持仓票）；否则按股票持仓内部占比
    const positions = stockStore.stockPositions
    // 估值必须用原始价（P0 修复：hfq 价的复权倍数不同，权重会失真）
    const priced = Object.keys(usable).map((code) => ({
      code,
      price: rawKlines[code]?.[rawKlines[code].length - 1]?.close ?? usable[code][usable[code].length - 1]?.close ?? 0
    }))
    const priceMap = new Map(priced.map((item) => [item.code, item.price]))
    const totalAssets = Number(totalAssetsInput.value) * 10_000

    if (totalAssets > 0) {
      const priced_ = Object.keys(usable).map((code) => {
        const price = priceMap.get(code) ?? 0
        const shares = positions[code]?.shares ?? 0
        return { code, name: displayName(code), value: shares * price }
      })
      const invested = priced_.reduce((total, item) => total + item.value, 0)
      const weights = targetWeights(rows.value, targetMode.value)
      holdingRows.value = priced_
        .map((item) => {
          const currentWeight = item.value / totalAssets
          const target = weights.get(item.code) ?? 0
          const drift = currentWeight - target
          return {
            code: item.code,
            name: item.name,
            targetPercent: Math.min(100, target * 100),
            currentPercent: Math.min(100, currentWeight * 100),
            drift,
            driftAmount: drift * totalAssets,
            held: item.value > 1
          }
        })
        .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift))
      const cashWeight = Math.max(0, 1 - invested / totalAssets)
      cashRow.value = {
        percent: cashWeight * 100,
        amount: cashWeight * totalAssets,
        text: `占 ${(cashWeight * 100).toFixed(1)}%`
      }
    } else {
      cashRow.value = null
      const heldValue = Object.entries(positions).reduce((total, [code, position]) => {
        const price = priceMap.get(code) ?? 0
        return total + position.shares * price
      }, 0)

      // 未填总资金：按股票持仓内部占比对照；未持仓的自选也列出建仓目标（无金额基数）
      const weightsInner = targetWeights(rows.value, targetMode.value)
      holdingRows.value = Object.keys(usable)
        .map((code) => {
          const price = priceMap.get(code) ?? 0
          const shares = positions[code]?.shares ?? 0
          const currentWeight = heldValue > 0 ? (shares * price) / heldValue : 0
          const target = weightsInner.get(code) ?? 0
          const drift = currentWeight - target
          return {
            code,
            name: displayName(code),
            targetPercent: Math.min(100, target * 100),
            currentPercent: Math.min(100, currentWeight * 100),
            drift,
            driftAmount: heldValue > 0 ? drift * heldValue : null,
            held: shares > 0
          }
        })
        .sort((left, right) => Math.abs(right.drift) - Math.abs(left.drift))
    }

    updatedAt.value = new Date()
  } finally {
    loading.value = false
  }
}

function goBack(): void {
  stockStore.setActiveAssetType(lastWatchlistViewType())
}

function switchTargetMode(mode: 'equal' | 'score'): void {
  if (targetMode.value === mode) {
    return
  }
  targetMode.value = mode
  updatePersistedSlice('quantTargetMode', mode)
  void reload()
}

function saveTotalAssets(): void {
  const value = Number(totalAssetsInput.value)
  updatePersistedSlice('quantTotalAssets', Number.isFinite(value) && value > 0 ? value : null)
}

onMounted(() => {
  const savedMode = readPersistedSlice('quantTargetMode')
  if (savedMode === 'score') {
    targetMode.value = 'score'
  }
  const saved = readPersistedSlice('quantTotalAssets')
  if (typeof saved === 'number' && saved > 0) {
    totalAssetsInput.value = String(saved)
  }
  void reload()
})
</script>

<style scoped>
.quant-view{position:relative;flex:1;min-height:0;display:flex;flex-direction:column;padding:6px 0 0}
.quant-header{display:flex;align-items:center;gap:6px;margin:0 10px 8px}
.quant-title{font-size:13px;font-weight:800;color:var(--text-primary)}
.quant-sub{flex:1;font-size:10px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quant-refresh{width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:7px;background:transparent;color:var(--text-muted);cursor:pointer}
.quant-refresh:hover{color:var(--text-primary);background:rgba(255,255,255,.06)}
.quant-body{flex:1;min-height:0;overflow-y:auto;padding:0 10px 8px;display:flex;flex-direction:column;gap:12px}
.quant-empty{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:var(--text-muted);text-align:center}
.quant-empty p{font-size:13px;font-weight:600;color:var(--text-secondary)}
.quant-empty span{font-size:11px}
.quant-section h4{margin:0 0 6px;font-size:11px;font-weight:700;color:var(--text-secondary)}
.quant-section h4 span{font-weight:400;font-size:9px;color:var(--text-muted);margin-left:4px}
.quant-row{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.03)}
.quant-row+.quant-row{margin-top:3px}
.quant-row.active{background:rgba(45,124,246,.12);box-shadow:inset 2px 0 0 #2d7cf6}
.quant-rank{flex:0 0 16px;font-size:11px;font-weight:800;color:var(--text-muted);text-align:center}
.quant-row.active .quant-rank{color:#5da8ff}
.quant-name{flex:1;min-width:0;font-size:12px;font-weight:600;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.quant-mom{flex:0 0 44px;font-size:10px;text-align:right;font-variant-numeric:tabular-nums;color:var(--text-muted)}
.quant-score{flex:0 0 34px;font-size:12px;font-weight:800;text-align:right;font-variant-numeric:tabular-nums;color:var(--text-secondary)}
.quant-score.up{color:#ff7474}
.quant-score.down{color:#3ad283}
.quant-assets{display:inline-flex;align-items:center;gap:3px;margin-left:auto;font-size:9px;font-weight:400;color:var(--text-muted)}
.quant-assets input{width:44px;height:18px;padding:0 4px;border:1px solid rgba(255,255,255,.14);border-radius:5px;background:rgba(255,255,255,.05);color:var(--text-primary);font-size:10px;outline:none}
.quant-assets input:focus{border-color:rgba(93,168,255,.55)}
.quant-hold.cash{background:rgba(255,255,255,.02)}
.target-switch{display:inline-flex;margin-left:6px;padding:1px;border:1px solid rgba(255,255,255,.12);border-radius:6px}
.target-switch button{height:14px;padding:0 6px;border:none;border-radius:4px;background:transparent;color:var(--text-muted);font-size:9px;font-weight:700;cursor:pointer}
.target-switch button.active{color:#f8fbff;background:rgba(45,124,246,.75)}
.quant-hold{display:flex;align-items:center;gap:7px;padding:5px 7px;border-radius:8px;background:rgba(255,255,255,.03)}
.quant-hold+.quant-hold{margin-top:3px}
.quant-bars{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.quant-bar{height:4px;border-radius:2px}
.quant-bar.target{background:rgba(93,168,255,.55)}
.quant-bar.current{background:rgba(255,255,255,.22)}
.quant-drift{flex:0 0 64px;display:flex;flex-direction:column;align-items:flex-end;gap:1px;font-size:10px;font-weight:700;text-align:right;white-space:nowrap;color:var(--text-muted)}
.quant-drift i{font-style:normal;font-size:9px;font-weight:500;color:var(--text-muted);opacity:.8}
.quant-drift.up{color:#ff7474}
.quant-drift.down{color:#3ad283}
.quant-hint{margin:6px 0 0;font-size:10px;line-height:1.5;color:var(--text-muted)}
.quant-nav{width:100%;height:56px;display:block;margin-bottom:6px}
.nav-up{stroke:#ff7474}
.nav-down{stroke:#3ad283}
.quant-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.metric{display:flex;flex-direction:column;gap:2px;padding:6px 7px;border:1px solid rgba(255,255,255,.07);border-radius:8px;background:rgba(255,255,255,.03)}
.metric span{font-size:9px;color:var(--text-muted)}
.metric strong{font-size:12px;font-variant-numeric:tabular-nums;color:var(--text-primary)}
.metric strong.up{color:#ff7474}
.metric strong.down{color:#3ad283}
.quant-bottom{display:flex;align-items:center;justify-content:space-between;padding:4px 10px 6px}
.quant-back{display:inline-flex;align-items:center;gap:4px;height:24px;padding:0 9px;border:none;border-radius:7px;background:rgba(255,255,255,.05);color:var(--text-secondary);font-size:11px;font-weight:700;cursor:pointer}
.quant-back:hover{background:rgba(255,255,255,.09);color:var(--text-primary)}
.quant-updated{font-size:10px;color:var(--text-muted)}
</style>
