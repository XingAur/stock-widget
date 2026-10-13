import { describe, expect, it } from 'vitest'
import { changeToneToTrend, profitToneToTrend } from './tone'

describe('trend tone mapping', () => {
  it('maps quote change tones to coolove-ui rise/fall', () => {
    expect(changeToneToTrend('up')).toBe('rise')
    expect(changeToneToTrend('down')).toBe('fall')
    expect(changeToneToTrend('')).toBe('')
  })

  it('maps position profit tones to rise/fall/flat', () => {
    expect(profitToneToTrend('profit')).toBe('rise')
    expect(profitToneToTrend('loss')).toBe('fall')
    expect(profitToneToTrend('flat')).toBe('flat')
  })
})
