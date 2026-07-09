import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalCss = readFileSync(new URL('./global.css', import.meta.url), 'utf8')

describe('global light theme styles', () => {
  it('keeps semantic success and danger variables aligned with UI actions', () => {
    expect(globalCss).toContain('--success: #22c55e')
    expect(globalCss).toContain('--danger: #ef4444')
  })

  it('keeps order book buy and sell prices colored in light mode', () => {
    expect(globalCss).toContain('[data-theme="light"] .detail-view .orderbook-row.sell .orderbook-price')
    expect(globalCss).toContain('[data-theme="light"] .detail-view .orderbook-row.buy .orderbook-price')
    expect(globalCss).toContain('color: #ef4444 !important')
    expect(globalCss).toContain('color: #22c55e !important')
  })
})
