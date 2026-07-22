import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailVue = readFileSync(new URL('./Detail.vue', import.meta.url), 'utf8')

describe('detail order book source', () => {
  it('colors every order price from the current stock direction', () => {
    expect(detailVue).toContain("const orderBookToneClass = computed(() =>")
    expect(detailVue).toContain('.orderbook-row.up .orderbook-price{color:#ff7474}')
    expect(detailVue).toContain('.orderbook-row.down .orderbook-price{color:#3ad283}')
  })

  it('renders side depth bars, a dynamic center balance line, and intraday volume', () => {
    expect(detailVue).toContain('orderbook-depth')
    expect(detailVue).toContain('orderBookBalance')
    expect(detailVue).toContain('minute-volume-bar')
    expect(detailVue).toContain('volumeBars')
    expect(detailVue).toContain('const MINUTE_PRICE_BOTTOM = 196')
    expect(detailVue).toContain('const MINUTE_VOLUME_TOP = 218')
  })

  it('does not render unsupported large-order placeholders', () => {
    expect(detailVue).not.toContain('orderbook-large-row')
    expect(detailVue).not.toContain('大单')
  })

  it('keeps the last detail quote visible when a refresh fails', () => {
    expect(detailVue).toContain('detailRefreshError')
    expect(detailVue).toContain('股票详情刷新失败')
  })
})
