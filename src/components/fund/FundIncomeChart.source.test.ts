import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const incomeSource = readFileSync(new URL('./FundIncomeChart.vue', import.meta.url), 'utf8')
const detailSource = readFileSync(new URL('../../views/FundDetail.vue', import.meta.url), 'utf8')

describe('FundIncomeChart scrolling layout', () => {
  it('closes the fund detail height chain', () => {
    expect(detailSource).toMatch(/\.visual-panel\s*\{[^}]*min-height:\s*0;/s)
  })

  it('scrolls the whole tab instead of nesting a daily-row scroller', () => {
    expect(detailSource).toMatch(/\.tab-content\s*\{[^}]*overflow-y:\s*auto;/s)
    expect(incomeSource).not.toMatch(/\.income-card\s*\{[^}]*overflow:\s*hidden;/s)
    expect(incomeSource).not.toMatch(/\.income-list\s*\{[^}]*overflow-y:\s*auto;/s)
  })

  it('keeps every daily row in the selected range', () => {
    expect(incomeSource).not.toContain('.slice(0, 5)')
  })
})
