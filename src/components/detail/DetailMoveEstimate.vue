<template>
  <section class="move-estimate" aria-label="异动测算">
    <header class="move-head">
      <div class="move-heading">
        <strong>{{ name }} <small>{{ code }}</small></strong>
        <span>{{ estimate.profile.label }} · {{ estimate.profile.indexName }}</span>
      </div>
      <div class="move-quote" :class="getSignedChangeTone(changePercent)">
        <strong>{{ number(price) }}</strong> {{ percent(changePercent) }}
      </div>
      <button class="move-button" :disabled="loading" @click="$emit('refresh')">刷新</button>
    </header>

    <div class="move-summary" :class="summary.tone">
      <div class="move-summary-heading">
        <strong class="move-summary-main">{{ summary.title }}</strong>
        <span v-if="closest?.current" class="move-pill">{{ ruleLabel(closestIndex, closest) }}</span>
      </div>
      <p v-if="closest?.changePercent != null">
        触发需 {{ percent(closest.changePercent) }}，{{ limitLabel }}价 {{ number(closest.limitPrice) }}
      </p>
      <p>{{ estimate.today.date }} · 昨收 {{ number(prevClose) }} · {{ estimate.profile.indexName }}
        {{ number(estimate.indexLastClose) }} {{ percent(estimate.indexChange) }}
      </p>
      <p v-if="!estimate.today.unavailable" class="move-summary-sub">
        近 10 日同向异动 ↑{{ estimate.sameDirection.up }} / ↓{{ estimate.sameDirection.down }}，阈值 {{ estimate.sameDirection.limit }} 次
      </p>
    </div>

    <section class="move-section" aria-labelledby="move-deviation-heading">
      <div class="move-section-heading">
        <h3 id="move-deviation-heading">当前偏离状态</h3>
        <div class="move-directions" role="group" aria-label="偏离方向">
          <button v-for="option in directions" :key="option.key" class="move-button"
            :aria-pressed="direction === option.key" @click="direction = option.key">
            {{ option.label }}
          </button>
        </div>
      </div>

      <article v-for="(line, index) in currentLines" :key="line.threshold" class="move-deviation" :class="lineTone(line)">
        <div class="move-section-heading">
          <h4>{{ ruleLabel(index, line) }} 偏离值</h4>
          <span class="move-pill">{{ lineStatus(line) }}</span>
        </div>
        <template v-if="line.current">
          <strong class="move-value">{{ number(line.current.value) }}%</strong>
          <div class="move-progress" role="progressbar" :aria-label="ruleLabel(index, line)" :aria-valuenow="progress(line)">
            <span :style="{ width: progress(line) + '%' }"></span>
          </div>
          <p class="move-gap">{{ line.reached ? '已达到偏离阈值' : '距阈值还差 ' + number(gap(line)) + ' 个百分点' }}</p>
          <dl class="move-metrics">
            <div><dt>区间个股涨跌</dt><dd :class="getSignedChangeTone(line.current.stockReturn)">{{ percent(line.current.stockReturn) }}</dd></div>
            <div><dt>同期指数涨跌</dt><dd :class="getSignedChangeTone(line.current.indexReturn)">{{ percent(line.current.indexReturn) }}</dd></div>
            <div><dt>今日触发价</dt><dd>{{ number(line.price) }}</dd><span>{{ percent(line.changePercent) }}</span></div>
          </dl>
          <p>自 {{ line.current.baseDate }} 收盘至 {{ estimate.today.date }}
            <template v-if="line.baseDate !== line.current.baseDate"> · 触发价按 {{ line.baseDate }} 收盘起算</template>
          </p>
          <p v-if="line.fullWindow && line.fullWindow.baseDate !== line.current.baseDate">
            完整 {{ estimate.profile.severeRules[index].days }} 日（{{ line.fullWindow.baseDate }} 收盘起）
            个股 {{ percent(line.fullWindow.stockReturn) }}，指数 {{ percent(line.fullWindow.indexReturn) }}，
            偏离 {{ percent(line.fullWindow.value) }}
          </p>
        </template>
      </article>
    </section>

    <section class="move-section" aria-labelledby="move-ordinary-heading">
      <div class="move-section-heading">
        <h3 id="move-ordinary-heading">普通异动与同向次数</h3>
        <span v-if="estimate.ordinary.direction || estimate.ordinary.turnover?.triggered" class="move-pill">测算达标</span>
      </div>
      <div class="move-details">
        <p>3 日偏离阈值 ±{{ estimate.profile.abnormal3dThreshold }}%
          <template v-if="ordinaryLine.current"> · 当前 {{ percent(ordinaryLine.current.value) }}</template>
          <template v-else> · 数据不足</template>
        </p>
        <p v-if="estimate.profile.turnoverRule">
          3 日累计换手 {{ estimate.ordinary.turnover ? number(estimate.ordinary.turnover.cumulative) + '%' : '--' }} / 20%
          · 日均比值 {{ number(estimate.ordinary.turnover?.ratio) }} / 30 倍
          <template v-if="estimate.ordinary.turnover?.triggered"> · 已达标</template>
        </p>
        <p v-if="estimate.sameDirection.projected[direction] !== null">
          连续{{ limitLabel }}推演至 T+{{ estimate.sameDirection.projected[direction] }} 达同向次数阈值
        </p>
      </div>
    </section>

    <section class="move-section" aria-labelledby="move-trigger-heading">
      <div class="move-section-heading">
        <h3 id="move-trigger-heading">严重异动触发线</h3>
        <span>指数跟随最新行情</span>
      </div>
      <p class="move-table-hint">未来指数按最新点位推演。能触发时按避开阈值的一档价格续算，其余按{{ limitLabel }}价续算。</p>
      <table class="move-table">
        <thead>
          <tr><th scope="col">交易日</th><th v-for="(line, index) in currentLines" :key="line.threshold" scope="col">{{ ruleLabel(index, line) }}</th></tr>
        </thead>
        <tbody>
          <tr v-for="(row, index) in visibleRows" :key="row.date" class="move-row">
            <th scope="row"><strong>{{ index === 0 ? '当日 T+0' : 'T+' + index }}</strong><span>{{ row.date }}</span></th>
            <td v-for="line in row[direction]" :key="line.threshold" class="move-cell">
              <strong :class="getSignedChangeTone(line.changePercent)">{{ percent(line.changePercent) }}</strong>
              <span>触发价 {{ number(line.price) }}</span>
              <span v-if="line.price !== null && !line.reachable">{{ limitLabel }}不触发</span>
            </td>
          </tr>
        </tbody>
      </table>
      <button v-if="estimate.rows.length > 4" class="move-button move-more" :aria-expanded="showAll" @click="showAll = !showAll">
        {{ showAll ? '收起' : `查看更多 · 剩余 ${estimate.rows.length - 4} 个交易日` }}
      </button>
    </section>
    <p class="move-note">盘中测算以最新成交价估算收盘结果，异动认定以交易所公布为准。</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { formatOptionalNumber as number, formatSignedOptionalPercent as percent, getSignedChangeTone } from '../../utils/format'
import { buildSevereEstimate, type BuildSevereEstimateInput, type Direction, type TriggerLine } from '../../utils/moveEstimate'

const props = defineProps<BuildSevereEstimateInput & { changePercent: number; loading: boolean }>()
defineEmits<{ refresh: [] }>()

const direction = ref<Direction>('up')
const directions = [{ key: 'up', label: '上涨' }, { key: 'down', label: '下跌' }] as const
const showAll = ref(false)
const estimate = computed(() => buildSevereEstimate(props))
const currentLines = computed(() => estimate.value.today[direction.value])
const ordinaryLine = computed(() => estimate.value.ordinary[direction.value])
const visibleRows = computed(() => showAll.value ? estimate.value.rows : estimate.value.rows.slice(0, 4))
const limitLabel = computed(() => direction.value === 'up' ? '涨停' : '跌停')
const closestIndex = computed(() => {
  const score = (line: TriggerLine) => line.current
    ? line.reached ? -1 : line.reachable ? 0 : 1
    : 2
  return currentLines.value.reduce((best, line, index, lines) => {
    const priority = score(line) - score(lines[best])
    return priority < 0 || (priority === 0 && gap(line) / Math.abs(line.threshold) <
      gap(lines[best]) / Math.abs(lines[best].threshold)) ? index : best
  }, 0)
})
const closest = computed(() => currentLines.value[closestIndex.value])
const summary = computed(() => {
  if (estimate.value.today.unavailable) {
    return { title: props.loading ? '正在加载异动数据' : estimate.value.today.unavailable, tone: 'neutral' }
  }
  if (estimate.value.today.triggered) return { title: '严重异动测算达标', tone: 'danger' }
  if (closest.value?.reachable) return { title: `今日${limitLabel.value}可触发偏离规则`, tone: 'warning' }
  return { title: `今日${limitLabel.value}不触发严重偏离`, tone: 'safe' }
})

function ruleLabel(index: number, line: TriggerLine) {
  return `${estimate.value.profile.severeRules[index].days} 日 ${line.threshold}%`
}

function gap(line: TriggerLine) {
  return Math.max(0, (line.threshold - (line.current?.value ?? 0)) * Math.sign(line.threshold))
}

function progress(line: TriggerLine) {
  return Math.max(0, Math.min(100, Math.round((line.current?.value ?? 0) / line.threshold * 1000) / 10))
}

function lineTone(line: TriggerLine) {
  if (!line.current) return 'neutral'
  if (line.reached) return 'danger'
  return progress(line) >= 80 ? 'warning' : 'safe'
}

function lineStatus(line: TriggerLine) {
  return { neutral: '数据不足', danger: '已达标', warning: '接近', safe: '未达标' }[lineTone(line)]
}
</script>

<style scoped>
.move-estimate{height:100%;min-height:0;overflow-y:auto;scrollbar-width:thin;padding:0 3px 10px;font-variant-numeric:tabular-nums}
.move-head{position:sticky;top:0;z-index:1;display:flex;align-items:center;gap:8px;padding:8px 0;background:var(--solid-bg)}
.move-heading{display:grid;min-width:0;margin-right:auto;gap:1px}
.move-heading strong,.move-quote strong{font-size:15px;color:var(--text-primary)}
.move-heading small,.move-heading>span,.move-section-heading>span:not(.move-pill){font-size:10px;font-weight:500;color:var(--text-secondary)}
.move-quote{font-size:11px;white-space:nowrap}
.move-quote strong{color:inherit}
.up{color:var(--rise)}
.down{color:var(--fall)}
.move-summary,.move-section{margin-bottom:9px;border-radius:var(--radius-sm)}
.move-summary{padding:9px 10px;border-left:3px solid var(--move-tone);background:var(--move-tint)}
.move-summary-heading,.move-section-heading{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:5px 8px}
.move-summary-main{font-size:17px;line-height:1.3;color:var(--move-tone)}
.move-summary p,.move-deviation p,.move-details p,.move-table-hint,.move-note{margin:4px 0 0;color:var(--text-secondary);font-size:11px;line-height:1.5}
.move-section{display:grid;gap:8px;padding:9px;border:1px solid var(--divider-color)}
.move-section h3,.move-section h4{margin:0;color:var(--text-primary)}
.move-section h3{font-size:14px}
.move-section h4{font-size:13px}
.move-directions{display:flex;gap:3px}
.move-button{padding:3px 8px;border:1px solid var(--divider-color);border-radius:var(--radius-xs);background:var(--surface-2);color:var(--text-secondary);font-size:11px;cursor:pointer}
.move-button[aria-pressed="true"]{background:var(--surface-1);color:var(--text-primary);border-color:var(--border-strong);font-weight:700}
.move-button:disabled{cursor:wait;opacity:.6}
.move-deviation{padding:9px;border:1px solid var(--divider-color);border-radius:var(--radius-sm)}
.neutral{--move-tone:var(--text-secondary);--move-tint:var(--surface-2)}
.safe{--move-tone:var(--c-green);--move-tint:var(--c-green-soft)}
.warning{--move-tone:var(--c-amber);--move-tint:var(--c-amber-soft)}
.danger{--move-tone:var(--c-red);--move-tint:var(--c-red-soft)}
.move-pill{border-radius:999px;padding:2px 7px;background:var(--move-tint,var(--surface-2));color:var(--move-tone,var(--text-secondary));font-size:10px;white-space:nowrap}
.move-value{display:block;margin:4px 0;font-size:25px;line-height:1.15;color:var(--move-tone)}
.move-progress{height:4px;overflow:hidden;border-radius:999px;background:var(--surface-2);border:1px solid var(--divider-color);box-sizing:content-box}
.move-progress>span{display:block;height:100%;border-radius:inherit;background:var(--move-tone)}
.move-deviation .move-gap{font-weight:650;color:var(--move-tone)}
.move-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:5px;margin:7px 0}
.move-metrics>div{display:flex;flex-direction:column;align-items:center;text-align:center;padding:5px 2px;border-radius:var(--radius-xs);background:var(--surface-2)}
.move-metrics dt{order:1;color:var(--text-secondary);font-size:10px}
.move-metrics dd{margin:0;font-size:14px;font-weight:700}
.move-metrics span{order:2;font-size:10px;color:var(--text-secondary)}
.move-details p,.move-table-hint{margin:0}
.move-table{width:100%;border-collapse:collapse;table-layout:fixed;text-align:left}
.move-table tr{border-bottom:1px solid var(--divider-color)}
.move-table th,.move-table td{padding:5px 3px;text-align:left;vertical-align:top;font-size:11px}
.move-table strong,.move-table span{display:block}
.move-table span{font-size:10px;font-weight:400;color:var(--text-secondary)}
.move-more{width:100%;padding:5px}
</style>
