import { describe, expect, it } from 'vitest'
import {
  formatAmount,
  formatMA,
  formatMarketCap,
  formatOrderBookVolume,
  formatPrice,
  formatSigned,
  formatSignedPercent,
  formatVolume
} from './format'

describe('format helpers', () => {
  it('formats signed values and percentages', () => {
    expect(formatSigned(1.23)).toBe('+1.23')
    expect(formatSigned(-1.23)).toBe('-1.23')
    expect(formatSignedPercent(2.5)).toBe('+2.50%')
  })

  it('formats price and missing moving averages', () => {
    expect(formatPrice(12.345)).toBe('12.35')
    expect(formatPrice(Number.NaN)).toBe('--')
    expect(formatMA(Number.NaN)).toBe('--')
  })

  it('formats volume and amount units', () => {
    expect(formatVolume(120_000_000)).toBe('1.20<span class="stat-unit">亿手</span>')
    expect(formatVolume(12_000)).toBe('1.20<span class="stat-unit">万手</span>')
    expect(formatAmount(120_000_000)).toBe('1.20<span class="stat-unit">亿</span>')
    expect(formatMarketCap(6_500)).toBe('6500.00<span class="stat-unit">亿</span>')
  })

  it('formats order book volume in lots', () => {
    expect(formatOrderBookVolume(2300)).toBe('2300')
  })
})
