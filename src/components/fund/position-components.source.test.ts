import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readComponent(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
}

describe('fund position interaction components', () => {
  it('supports buy, sell and adjustment forms with previews and safeguards', () => {
    const source = readComponent('FundPositionDialog.vue')

    expect(source).toContain('仅记录模拟持仓')
    expect(source).toContain('加仓金额')
    expect(source).toContain('卖出份额')
    expect(source).toContain('1/4')
    expect(source).toContain('全部')
    expect(source).toContain('持有收益')
    expect(source).toContain('findNavOnOrBefore')
    expect(source).toContain('validateFundPositionForm')
  })

  it('shows baseline and transactions while protecting adjustment boundaries', () => {
    const source = readComponent('FundTransactionList.vue')

    expect(source).toContain('期初持仓')
    expect(source).toContain('加仓')
    expect(source).toContain('减仓')
    expect(source).toContain('持仓调整')
    expect(source).toContain("transaction.type !== 'adjustment'")
    expect(source).toContain('删除')
    expect(source).toContain('编辑')
  })
})
