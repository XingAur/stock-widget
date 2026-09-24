import { describe, expect, it } from 'vitest'
import type { KlinePoint } from '../api/stock'
import {
  DEFAULT_BACKTEST_CONFIG,
  computeFactorRows,
  isLimitDownDay,
  isLimitUpDay,
  momentum20,
  reversal5,
  runEqualWeightBacktest,
  volatility20
} from './quant'

function kline(closes: number[], opens?: number[]): KlinePoint[] {
  return closes.map((close, index) => ({
    time: `2026-01-${String(index + 1).padStart(2, '0')}`,
    open: opens ? opens[index] : close,
    close,
    high: close * 1.01,
    low: close * 0.99,
    volume: 1000
  }))
}

describe('factors', () => {
  it('momentum20 measures the 21-bar ratio', () => {
    const rising = Array.from({ length: 21 }, (_, i) => 100 + i)
    expect(momentum20(rising)).toBeCloseTo(120 / 100 - 1, 10)
    expect(momentum20([100, 101])).toBeNull()
  })

  it('reversal5 measures the 6-bar ratio with a NEGATIVE sign (fix: matches Python)', () => {
    const flat = Array.from({ length: 6 }, () => 10)
    expect(reversal5(flat)).toBeCloseTo(0, 10)
    expect(reversal5([10, 11])).toBeNull()
    // 涨了 20% 的票：反转分应为 -0.2（超跌反弹假设，与 a-share-quant 一致）
    const rose = Array.from({ length: 6 }, (_, i) => 100 + i * 4)
    expect(reversal5(rose)).toBeCloseTo(-(120 / 100 - 1), 10)
    // 跌了的票：反转分为正
    const fell = Array.from({ length: 6 }, (_, i) => 120 - i * 4)
    expect(reversal5(fell)).toBeCloseTo(-(100 / 120 - 1), 10)
  })

  it('volatility20 computes rolling std of returns', () => {
    const calm = Array.from({ length: 21 }, () => 100)
    expect(volatility20(calm)).toBeCloseTo(0, 10)
    const wild = Array.from({ length: 21 }, (_, i) => (i % 2 === 0 ? 100 : 110))
    expect((volatility20(wild) as number) > 0.05).toBe(true)
  })

  it('ranks composite scores cross-sectionally', () => {
    const winner = kline(Array.from({ length: 30 }, (_, i) => 100 + i * 2))
    const loser = kline(Array.from({ length: 30 }, (_, i) => 200 - i))
    const rows = computeFactorRows({ 'sh600001': winner, 'sz000001': loser })
    expect(rows[0].code).toBe('sh600001')
    expect(rows[0].rank).toBe(1)
    expect(rows[1].rank).toBe(2)
  })

  it('marks insufficient history as null without breaking the ranking', () => {
    const rows = computeFactorRows({ 'sh600001': kline(Array.from({ length: 30 }, (_, i) => 100 + i)), 'sz000002': kline([10, 11]) })
    expect(rows[0].code).toBe('sh600001')
    expect(rows[1].composite).toBeNull()
    expect(rows[1].rank).toBe(0)
  })
})

describe('runEqualWeightBacktest', () => {
  it('holds cash when the pool is empty', () => {
    const result = runEqualWeightBacktest({})
    expect(result.nav).toEqual([])
    expect(result.finalEquity).toBe(DEFAULT_BACKTEST_CONFIG.initialCash)
  })

  it('grows on a steady rising pool and survives a mid-series split', () => {
    // 模拟 10 送 10：第 40 天起价格腰斩但 hfq 连续（复权价不跳变）
    const prices = [
      ...Array.from({ length: 40 }, (_, i) => 100 + i),
      ...Array.from({ length: 40 }, (_, i) => 140 + i * 0.5)
    ]
    const result = runEqualWeightBacktest({ 'sh600001': kline(prices) })
    expect(result.totalReturn).toBeGreaterThan(0.2)
    // 单边上涨不应出现大幅回撤
    expect(result.maxDrawdown).toBeGreaterThan(-0.05)
  })

  it('detects limit moves with board-specific ratios', () => {
    expect(isLimitUpDay(10, 11, 'sh600000')).toBe(true)
    expect(isLimitUpDay(10, 10.5, 'sh600000')).toBe(false)
    // 创业板 20%
    expect(isLimitUpDay(10, 11, 'sz300001')).toBe(false)
    expect(isLimitUpDay(10, 12, 'sz300001')).toBe(true)
    // 北交所 30%
    expect(isLimitUpDay(10, 13, 'bj430047')).toBe(true)
    expect(isLimitDownDay(10, 9, 'sh600000')).toBe(true)
    expect(isLimitDownDay(10, 9.1, 'sh600000')).toBe(false)
  })

  it('estimates a two-asset equal-weight pool without crash', () => {
    const a = kline(Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i / 3) * 5 + i * 0.2))
    const b = kline(Array.from({ length: 50 }, (_, i) => 50 + Math.cos(i / 4) * 3 + i * 0.1))
    const result = runEqualWeightBacktest({ 'sh600001': a, 'sz000001': b })
    expect(result.nav.length).toBeGreaterThan(40)
    expect(Number.isFinite(result.maxDrawdown)).toBe(true)
    expect(Number.isFinite(result.annualizedReturn)).toBe(true)
  })
})

import { parseReport, formatReportMetrics } from './quant/report'

describe('report import', () => {
  it('parses a versioned report and caps nav length', () => {
    const payload = {
      report_version: 1,
      strategy_id: 'S1',
      metrics: { total_return: 4.9333, annualized_return: null, max_drawdown: -0.354 },
      evidence_status: 'exploratory',
      nav: Array.from({ length: 30 }, (_, i) => ({ date: `2026-01-${i + 1}`, value: 1_000_000 + i })),
      interval: { start: '2024-01-02', end: '2026-09-22' }
    }
    const report = parseReport(payload)
    expect(report).not.toBeNull()
    expect(report!.nav).toHaveLength(30)
    const metrics = formatReportMetrics(report!)
    expect(metrics[0]).toEqual({ label: '总收益', value: '493.3%' })
    expect(metrics[1].value).toBe('短样本')
  })

  it('rejects unknown versions and non-objects', () => {
    expect(parseReport({ report_version: 2 })).toBeNull()
    expect(parseReport(null)).toBeNull()
    expect(parseReport('x')).toBeNull()
  })
})
