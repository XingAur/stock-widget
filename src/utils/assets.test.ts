import { describe, expect, it } from 'vitest'
import { getAssetTitle, getNextAssetType } from './assets'

describe('asset title helpers', () => {
  it('maps active asset type to title text', () => {
    expect(getAssetTitle('stock')).toBe('A+Stock Assistant')
    expect(getAssetTitle('fund')).toBe('A+Fund Assistant')
  })

  it('toggles between stock and fund', () => {
    expect(getNextAssetType('stock')).toBe('fund')
    expect(getNextAssetType('fund')).toBe('stock')
  })
})
