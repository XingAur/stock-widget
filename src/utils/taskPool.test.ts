import { describe, expect, it } from 'vitest'
import { mapPool } from './taskPool'

describe('mapPool', () => {
  it('caps concurrency and preserves order', async () => {
    let inflight = 0
    let max = 0
    const result = await mapPool([1, 2, 3, 4, 5], 2, async (value) => {
      inflight += 1
      max = Math.max(max, inflight)
      await Promise.resolve()
      inflight -= 1
      return value * 10
    })
    expect(result).toEqual([10, 20, 30, 40, 50])
    expect(max).toBeLessThanOrEqual(2)
  })
})
