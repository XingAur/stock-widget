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

  it('colors detail charts with theme tokens instead of light-mode overrides', () => {
    // 浅色主题的图表、盘口颜色由 coolove-ui token 自动切换，不再需要 !important 覆盖
    expect(globalCss).not.toContain('!important')
    expect(globalCss).not.toContain('.detail-view')
    expect(cooloveCss).toMatch(/\[data-theme="light"\][^{]*\{[^}]*--series-avg:/)
    expect(cooloveCss).toContain('--rise: var(--c-red)')
    expect(cooloveCss).toContain('--fall: var(--c-green)')
  })
})
