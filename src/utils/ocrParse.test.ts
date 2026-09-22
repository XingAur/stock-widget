import { describe, expect, it } from 'vitest'
import { parseOcrLines } from './ocrParse'

describe('parseOcrLines', () => {
  it('extracts stock codes with names from broker screenshots', () => {
    const result = parseOcrLines([
      '中信证券 600030 12,254.00 +6,553.80 +54.96% 22.69 540股',
      '中国银河 601198 13,749.60 -1,295.04 -3.01% 40.44 340股',
      '海油发展 600968 7,667.60 +11,553.16 +8.13% 9.77 540股'
    ])

    expect(result.stocks).toEqual([
      { code: '600030', name: '中信证券' },
      { code: '601198', name: '中国银河' },
      { code: '600968', name: '海油发展' }
    ])
    expect(result.funds).toEqual([])
  })

  it('extracts fund names when codes are absent', () => {
    const result = parseOcrLines([
      '诺安积极回报混合C 90.77 25.92%',
      '平安黄金ETF联接C 1,291.58 128.56 11.08%',
      '招商中证白酒指数(LOF)A 2,254.00',
      '易方达蓝筹精选混合 8,120.00'
    ])

    expect(result.stocks).toEqual([])
    expect(result.funds.map((fund) => fund.name)).toEqual([
      '诺安积极回报混合C',
      '平安黄金ETF联接C',
      '招商中证白酒指数(LOF)A',
      '易方达蓝筹精选混合'
    ])
  })

  it('deduplicates repeated codes and names within one screenshot', () => {
    const result = parseOcrLines([
      '中信证券 600030 12,254.00',
      '中信证券 600030 12,254.00 +6,553.80',
      '易方达蓝筹精选混合 8,120.00',
      '易方达蓝筹精选混合 8,120.00'
    ])

    expect(result.stocks).toHaveLength(1)
    expect(result.funds).toHaveLength(1)
  })

  it('ignores amount and date numbers that are not six-digit codes', () => {
    const result = parseOcrLines([
      '持仓市值 44,754.20 盈亏 2,443.98',
      '2026-09-22 15:00:00',
      '昨日收益 128.56 持有收益率 11.08%'
    ])

    expect(result.stocks).toEqual([])
    expect(result.funds).toEqual([])
  })

  it('does not treat plain stock names as fund names', () => {
    const result = parseOcrLines(['东方财富 300059 44,754.20'])

    expect(result.stocks).toEqual([{ code: '300059', name: '东方财富' }])
    expect(result.funds).toEqual([])
  })

  it('handles mixed screenshot headers and noise lines', () => {
    const result = parseOcrLines([
      '我的基金 全部 偏股 偏债 指数 黄金 全球',
      '招商中证白酒指数(LOF)A 2,254.00 25.92% 11.08%',
      '组合收益明细',
      '600030 中信证券 22.69'
    ])

    expect(result.funds.map((fund) => fund.name)).toEqual(['招商中证白酒指数(LOF)A'])
    expect(result.stocks).toEqual([{ code: '600030', name: '中信证券' }])
  })
})
