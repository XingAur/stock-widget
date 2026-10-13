import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const globalCss = readFileSync(new URL('./global.css', import.meta.url), 'utf8')
const cooloveCss = readFileSync(new URL('../coolove-ui/coolove-ui.css', import.meta.url), 'utf8')

describe('global light theme styles', () => {
  it('keeps semantic success and danger variables aligned with UI actions', () => {
    // 语义色由 coolove-ui 提供：深色主题下成功/危险与按钮、涨跌柱使用同一组红绿
    expect(cooloveCss).toContain('--c-green-strong: #22c55e')
    expect(cooloveCss).toContain('--c-red-strong: #ef4444')
    expect(cooloveCss).toContain('--success: var(--c-green-strong)')
    expect(cooloveCss).toContain('--danger: var(--c-red-strong)')
  })

  it('keeps order book prices colored by price tone in light mode', () => {
    expect(globalCss).toContain('[data-theme="light"] .detail-view .orderbook-row.up .orderbook-price')
    expect(globalCss).toContain('[data-theme="light"] .detail-view .orderbook-row.down .orderbook-price')
    expect(globalCss).toContain('color: #ef4444 !important')
    expect(globalCss).toContain('color: #22c55e !important')
  })
})
