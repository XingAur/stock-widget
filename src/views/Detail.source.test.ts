import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailVue = readFileSync(new URL('./Detail.vue', import.meta.url), 'utf8')
const orderBookVue = readFileSync(new URL('../components/detail/DetailOrderBook.vue', import.meta.url), 'utf8')

describe('detail order book source', () => {
  it('colors every order price from the current stock direction', () => {
    expect(detailVue).toContain("const orderBookToneClass = computed(() =>")
    // 涨跌色走 coolove-ui token，红涨绿跌 / 绿涨红跌由 data-trend 决定，深浅色主题共用
    expect(orderBookVue).toContain('.orderbook-row.up .orderbook-price{color:var(--rise)}')
    expect(orderBookVue).toContain('.orderbook-row.down .orderbook-price{color:var(--fall)}')
  })

  it('renders side depth bars, a dynamic center balance line, and intraday volume', () => {
    expect(orderBookVue).toContain('orderbook-depth')
    expect(detailVue).toContain('orderBookBalance')
    expect(detailVue).toContain('minute-volume-bar')
    expect(detailVue).toContain('volumeBars')
    expect(detailVue).toContain('createMinuteChartGeometry')
    expect(detailVue).toContain('getRobustVolumeCeiling')
    expect(detailVue).toContain('minuteChartPanelHeight')
    expect(detailVue).toContain(':viewBox="`0 0 ${minuteChartModel.viewWidth} ${minuteChartModel.geometry.viewHeight}`"')
    expect(detailVue).toContain('.chart-card{flex:1;min-height:400px')
    expect(detailVue).toContain('.stock-header,.stats-grid{flex-shrink:0}')
    expect(orderBookVue).toContain('grid-template-rows:repeat(5,minmax(24px,1fr))')
  })

  it('does not render unsupported large-order placeholders', () => {
    expect(detailVue).not.toContain('orderbook-large-row')
    expect(detailVue).not.toContain('大单')
  })

  it('keeps the last detail quote visible when a refresh fails', () => {
    expect(detailVue).toContain('detailRefreshError')
    expect(detailVue).toContain('股票详情刷新失败')
  })

  it('pauses detail polling while the window is hidden', () => {
    expect(detailVue).toContain('isPageVisible')
    expect(detailVue).toContain('onPageVisibilityChange')
  })
})
