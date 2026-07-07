import { describe, expect, it } from 'vitest'
import { moveItem } from './list'

describe('moveItem', () => {
  it('moves an item down across multiple positions', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves an item up across multiple positions', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c'])
  })

  it('clamps target index into the list bounds', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 99)).toEqual(['a', 'c', 'b'])
    expect(moveItem(['a', 'b', 'c'], 1, -3)).toEqual(['b', 'a', 'c'])
  })

  it('returns an unchanged copy for no-op or invalid sources', () => {
    const source = ['a', 'b', 'c']

    expect(moveItem(source, 1, 1)).toEqual(source)
    expect(moveItem(source, -1, 1)).toEqual(source)
    expect(moveItem(source, 3, 1)).toEqual(source)
    expect(moveItem(source, 1, Number.NaN)).toEqual(source)
    expect(moveItem(source, 1, 1)).not.toBe(source)
  })
})
