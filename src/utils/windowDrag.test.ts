// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { isWindowDragTarget } from './windowDrag'

function elementFrom(markup: string): EventTarget | null {
  const container = document.createElement('div')
  container.innerHTML = markup
  return container.firstElementChild
}

describe('isWindowDragTarget', () => {
  it('allows plain blank areas like headers and list gaps', () => {
    expect(isWindowDragTarget(elementFrom('<div class="title-bar"></div>'))).toBe(true)
    expect(isWindowDragTarget(elementFrom('<section class="workspace"></section>'))).toBe(true)
  })

  it('rejects interactive controls so clicks keep working', () => {
    expect(isWindowDragTarget(elementFrom('<button title="刷新"></button>'))).toBe(false)
    expect(isWindowDragTarget(elementFrom('<input type="text" />'))).toBe(false)
    expect(isWindowDragTarget(elementFrom('<a href="#"></a>'))).toBe(false)
    expect(isWindowDragTarget(elementFrom('<label><span>成本价</span></label>'))).toBe(false)
  })

  it('rejects nested interactive descendants, not only the control itself', () => {
    expect(isWindowDragTarget(elementFrom('<button><span><i>icon</i></span></button>'))).toBe(false)
  })

  it('rejects asset cards which handle their own click and reorder drag', () => {
    expect(isWindowDragTarget(elementFrom('<div class="stock-card" data-drag-card="true"></div>'))).toBe(false)
  })

  it('rejects chart svg surfaces that own hover and pan gestures', () => {
    expect(isWindowDragTarget(elementFrom('<svg class="chart-svg"></svg>'))).toBe(false)
    expect(isWindowDragTarget(elementFrom('<svg><polyline /></svg>'))).toBe(false)
  })

  it('rejects areas explicitly marked as non-draggable', () => {
    expect(isWindowDragTarget(elementFrom('<div data-no-window-drag="true"></div>'))).toBe(false)
  })

  it('rejects non-element targets', () => {
    expect(isWindowDragTarget(null)).toBe(false)
    expect(isWindowDragTarget(document.createTextNode('text'))).toBe(false)
  })
})
