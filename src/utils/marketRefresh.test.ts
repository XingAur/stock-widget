import { describe, expect, it } from 'vitest'
import { marketErrorMessage, marketRefreshDelay } from './marketRefresh'

describe('market recovery', () => {
  it('retries failures even without open-market data, then stops', () => {
    expect([1, 2, 3, 4, 5].map(n => marketRefreshDelay(n, false)))
      .toEqual([15_000, 30_000, 60_000, null, null])
    expect(marketRefreshDelay(0, true)).toBe(60_000)
    expect(marketRefreshDelay(0, false)).toBe(300_000)
  })

  it('identifies the provider without exposing request URLs in the page', () => {
    expect(marketErrorMessage('industry-sectors', new Error('502 https://push2.eastmoney.com'))).toBe('东方财富服务暂时不可用')
    expect(marketErrorMessage('cn', 'request timed out')).toBe('腾讯行情请求超时')
    expect(marketErrorMessage('sectors', '429')).toContain('暂时拒绝请求')
    expect(marketErrorMessage('world', '非 JSON 数据')).toContain('暂未返回有效行情')
  })
})
