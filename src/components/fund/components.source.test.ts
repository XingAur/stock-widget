import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function readComponent(name: string): string {
  return readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
}

describe('fund detail chart components', () => {
  it('renders performance comparison with selectable ranges and resilient states', () => {
    const source = readComponent('FundPerformanceChart.vue')

    expect(source).toContain('本基金')
    expect(source).toContain('沪深300')
    expect(source).toContain('近1月')
    expect(source).toContain('全部')
    expect(source).toContain('暂无可对齐的业绩数据')
    expect(source).toContain('createLinePath')
    expect(source).toContain('filterFundNavPointsByRange(props.history, props.range)')
    expect(source).toContain('class="nav-history-table"')
    expect(source).toContain('日期')
    expect(source).toContain('单位净值')
    expect(source).toContain('累计净值')
    expect(source).toContain('日涨幅')
    expect(source).toContain('row.accumulatedNav.toFixed(4)')
  })

  it('renders industries and holdings with a report-period marker', () => {
    const source = readComponent('FundRelatedHoldings.vue')

    expect(source).toContain('行业配置')
    expect(source).toContain('重仓持股')
    expect(source).toContain('报告期')
    expect(source).toContain('暂无持仓披露数据')
  })

  it('renders cumulative income, range controls and income details', () => {
    const source = readComponent('FundIncomeChart.vue')

    expect(source).toContain('累计收益')
    expect(source).toContain('收益明细')
    expect(source).toContain('近3月')
    expect(source).toContain('调仓日')
    expect(source).toContain('createIncomeSeries')
  })
})
