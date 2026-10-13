import { describe, expect, it } from 'vitest'
import { getAStockSessionState, shouldRefreshSparkline } from './tradingSession'

describe('tradingSession', () => {
  it('uses Asia/Shanghai rather than the local clock', () => {
    // 2026-09-24 10:00 in Shanghai is 02:00 UTC on a Thursday
    expect(getAStockSessionState(new Date('2026-09-24T02:00:00.000Z'))).toBe('morning')
    expect(shouldRefreshSparkline(new Date('2026-09-24T02:00:00.000Z'))).toBe(true)
  })

  it('marks lunch, close and weekend', () => {
    expect(getAStockSessionState(new Date('2026-09-24T04:20:00.000Z'))).toBe('lunch')
    expect(getAStockSessionState(new Date('2026-09-24T07:10:00.000Z'))).toBe('closed')
    expect(getAStockSessionState(new Date('2026-09-26T02:00:00.000Z'))).toBe('weekend')
    expect(shouldRefreshSparkline(new Date('2026-09-26T02:00:00.000Z'))).toBe(false)
  })
})
