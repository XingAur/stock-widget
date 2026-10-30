import { describe, expect, it } from 'vitest'
import { anchoredWindowX, cornerPosition } from './windowGeometry'

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

describe('window corner snapping', () => {
  const workArea = { x: -1920, y: -200, width: 1920, height: 1040 }
  const size = { width: 250, height: 480 }

  it('places the window flush against each work area corner', () => {
    expect(cornerPosition('top-left', workArea, size)).toEqual({ x: -1920, y: -200 })
    expect(cornerPosition('top-right', workArea, size)).toEqual({ x: -250, y: -200 })
    expect(cornerPosition('bottom-left', workArea, size)).toEqual({ x: -1920, y: 360 })
    expect(cornerPosition('bottom-right', workArea, size)).toEqual({ x: -250, y: 360 })
  })

  it('rounds fractional scale factors to whole physical pixels', () => {
    expect(cornerPosition('bottom-right', { x: 0, y: 0, width: 1366.5, height: 728.4 }, { width: 312.5, height: 600.25 }))
      .toEqual({ x: 1054, y: 128 })
  })
})
