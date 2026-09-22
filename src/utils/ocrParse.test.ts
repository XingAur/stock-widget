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

describe('parseOcrLines with real Windows OCR output', () => {
  it('parses fund names with per-character spacing from Windows OCR', () => {
    const result = parseOcrLines([
      '11 ： 56',
      '〈 基 金]',
      '我 的 持 有 。',
      '金 额 扌 非 序',
      '偏 债',
      '3 ， 941 ． 82',
      '一 4 ． 53',
      '宏 利 半 导 体 产 业 混 合 C',
      '本 基 金 所 属 板 块 入 选 本 月 值 得 投',
      '嘉 实 中 证 科 创 创 业 50ETF',
      '联 接 C',
      '泰 信 资 源 睿 选 混 合 C',
      '设 备 ETF 联 接 C',
      '嘉 实 创 新 先 锋 混 合 C',
      '富 国 上 证 科 创 板 芯 片 ETF',
      '3 ， 379 ． 40',
      '+ 24 ． 39',
      '基 金 市 场',
      '排 行',
      '自 选',
      '全 球'
    ])

    expect(result.funds.map((fund) => fund.name)).toEqual([
      '宏利半导体产业混合C',
      '嘉实中证科创创业50ETF',
      '泰信资源睿选混合C',
      '设备ETF联接C',
      '嘉实创新先锋混合C',
      '富国上证科创板芯片ETF'
    ])
    // OCR 用中文标点分隔金额，不会拼出 6 位代码
    expect(result.stocks).toEqual([])
  })

  it('parses broker stock rows with per-character spacing', () => {
    const result = parseOcrLines([
      '中 信 证 券 6 0 0 0 3 0 1 2 , 2 5 4 . 0 0',
      '600030 中 信 证 券 22.69'
    ])

    expect(result.stocks).toEqual([{ code: '600030', name: '中信证券' }])
  })
})

describe('pure index fund names', () => {
  it('recognizes pure index funds with share-class suffix', () => {
    const result = parseOcrLines([
      '交 银 施 罗 德 创 业 板 50指 数 C 4,479.74',
      '易方达上证50指数A 3,000.00'
    ])

    expect(result.funds.map((fund) => fund.name)).toEqual([
      '交银施罗德创业板50指数C',
      '易方达上证50指数A'
    ])
  })

  it('still rejects short navigation words containing index', () => {
    const result = parseOcrLines(['偏 债 指 数', '我的基金 全部 偏股 偏债 指数 黄金 全球'])

    expect(result.funds).toEqual([])
  })
})

describe('code below name layout (xueqiu/tonghuashun watchlist)', () => {
  it('pairs a standalone code line with the name line above it', () => {
    const result = parseOcrLines([
      '永鼎股份',
      '600105',
      '45.36 -2.91%',
      '杭电股份',
      '603618',
      '38.76 -4.72%',
      '通鼎互联',
      '002491',
      '23.92 -2.72%'
    ])

    expect(result.stocks).toEqual([
      { code: '600105', name: '永鼎股份' },
      { code: '603618', name: '杭电股份' },
      { code: '002491', name: '通鼎互联' }
    ])
  })
})
