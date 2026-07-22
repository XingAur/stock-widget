import { afterEach, describe, expect, it, vi } from 'vitest'
import { focusFirstModalControl, trapModalFocus } from './modalFocus'

function createFocusable() {
  return {
    hidden: false,
    getAttribute: vi.fn(() => null),
    focus: vi.fn()
  } as unknown as HTMLElement
}

describe('modal focus helpers', () => {
  const originalDocument = globalThis.document

  afterEach(() => {
    Object.defineProperty(globalThis, 'document', {
      value: originalDocument,
      configurable: true
    })
  })

  it('focuses the first available control', () => {
    const first = createFocusable()
    const container = {
      querySelectorAll: vi.fn(() => [first])
    } as unknown as HTMLElement

    focusFirstModalControl(container)

    expect(first.focus).toHaveBeenCalledOnce()
  })

  it('wraps focus from the last control back to the first', () => {
    const first = createFocusable()
    const last = createFocusable()
    const container = {
      querySelectorAll: vi.fn(() => [first, last])
    } as unknown as HTMLElement
    Object.defineProperty(globalThis, 'document', {
      value: { activeElement: last },
      configurable: true
    })
    const preventDefault = vi.fn()

    trapModalFocus({ key: 'Tab', shiftKey: false, preventDefault } as unknown as KeyboardEvent, container)

    expect(preventDefault).toHaveBeenCalledOnce()
    expect(first.focus).toHaveBeenCalledOnce()
  })
})
