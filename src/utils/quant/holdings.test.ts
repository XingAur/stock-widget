import { describe, expect, it } from 'vitest'
import type { FactorRow } from './types'
import { compareRecordedHoldings } from './holdings'

function rankedRows(count: number): (FactorRow & { name: string })[] {
  return Array.from({ length: count }, (_, index) => ({
    code: `sh${String(index + 600000).padStart(6, '0')}`,
    name: `股票${index + 1}`,
    mom20: 0,
    rev5: 0,
    vol20: 0,
    composite: count - index,
    rank: index + 1,
    lastClose: 50
  }))
}

describe('recorded holdings comparison', () => {
  it('uses 55 watchlist candidates and only the recorded holdings plus Top 3 for comparison', () => {
    const candidates = rankedRows(55)
    const positions = Object.fromEntries(candidates.slice(0, 5).map((row) => [row.code, { costPrice: 7, shares: 100 }]))
    const prices = Object.fromEntries(candidates.map((row) => [row.code, 10]))
    const result = compareRecordedHoldings(candidates, positions, prices, 3, 'equal', (code) => code)

    expect(result.heldCount).toBe(5)
    expect(result.heldValue).toBe(5_000)
    expect(result.rows).toHaveLength(5)
    const first = result.rows.find((row) => row.code === candidates[0].code)
    expect(first?.currentPercent).toBe(20)
    expect(first?.driftAmount).toBeCloseTo(-666.6666666666665, 6)
    expect(result.rows.find((row) => row.code === candidates[4].code)).toMatchObject({
      targetPercent: 0,
      currentPercent: 20,
      driftAmount: 1_000
    })
  })

  it('does not infer holdings value or cash when a recorded position has no quote', () => {
    const candidates = rankedRows(2)
    const positions = { [candidates[0].code]: { costPrice: 5, shares: 100 } }
    const result = compareRecordedHoldings(candidates, positions, {}, 3, 'equal', (code) => code)

    expect(result.heldCount).toBe(1)
    expect(result.missingHeldQuotes).toBe(1)
    expect(result.heldValue).toBeNull()
    expect(result.rows.every((row) => row.drift === null && row.driftAmount === null)).toBe(true)
  })
})
