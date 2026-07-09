import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const detailVue = readFileSync(new URL('./Detail.vue', import.meta.url), 'utf8')

describe('detail order book source', () => {
  it('uses Tonghuashun-style volume bar colors for sell and buy levels', () => {
    expect(detailVue).toContain('.orderbook-row.sell .orderbook-volume-bar{background:rgba(29,128,53,.58)}')
    expect(detailVue).toContain('.orderbook-row.buy .orderbook-volume-bar{background:rgba(214,53,45,.42)}')
  })

  it('renders large-order rows as explicit placeholders when no reliable data source is available', () => {
    expect(detailVue).toContain('orderbook-large-row')
    expect(detailVue).toContain('orderbook-large-top')
    expect(detailVue).toContain('orderbook-large-bottom')
  })
})
