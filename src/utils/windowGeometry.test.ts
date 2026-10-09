import { describe, expect, it } from 'vitest'
import { anchoredWindowX } from './windowGeometry'

describe('widget window anchoring', () => {
  it.each([1, 1.25, 1.5, 2])('restores the compact location after left expansion at scale %s', (scale) => {
    const compact = 280 * scale
    const expanded = 900 * scale
    const original = 1920 - compact - 20
    const openX = anchoredWindowX(original, compact, expanded, 'left')
    expect(openX + expanded).toBe(original + compact)
    expect(anchoredWindowX(openX, expanded, compact, 'left')).toBe(original)
  })

  it('keeps the left edge for right expansion and supports negative monitor coordinates', () => {
    expect(anchoredWindowX(-1500, 280, 900, 'right')).toBe(-1500)
    const openX = anchoredWindowX(-300, 280, 900, 'left')
    expect(anchoredWindowX(openX, 900, 280, 'left')).toBe(-300)
  })
})
