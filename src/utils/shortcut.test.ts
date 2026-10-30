// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import {
  captureShortcut,
  formatShortcut,
  isValidShortcut,
  splitShortcut
} from './shortcut'

function keyEvent(init: KeyboardEventInit & { code: string }) {
  return new KeyboardEvent('keydown', init)
}

describe('shortcut string helpers', () => {
  it('accepts modifier combinations and rejects bare keys', () => {
    expect(isValidShortcut('Alt+Q')).toBe(true)
    expect(isValidShortcut('Ctrl+Shift+F5')).toBe(true)
    expect(isValidShortcut('Super+Space')).toBe(true)
    expect(isValidShortcut('Num1+Ctrl')).toBe(false)
    expect(isValidShortcut('Q')).toBe(false)
    expect(isValidShortcut('Hyper+Q')).toBe(false)
    expect(isValidShortcut('')).toBe(false)
    expect(isValidShortcut('Ctrl+F25')).toBe(false)
  })

  it('formats shortcuts for display', () => {
    expect(formatShortcut('Alt+Q')).toBe('Alt + Q')
    expect(formatShortcut('Ctrl+Super+Space')).toBe('Ctrl + Win + Space')
    expect(formatShortcut('')).toBe('未设置')
  })

  it('splits tokens and drops empty segments', () => {
    expect(splitShortcut('Ctrl +  Shift+F5')).toEqual(['Ctrl', 'Shift', 'F5'])
    expect(splitShortcut('')).toEqual([])
  })
})

describe('captureShortcut', () => {
  it('builds a canonical combination from the keyboard event', () => {
    expect(captureShortcut(keyEvent({ key: 'q', code: 'KeyQ', altKey: true })))
      .toEqual({ type: 'shortcut', value: 'Alt+Q' })

    expect(captureShortcut(keyEvent({ key: 'Q', code: 'KeyQ', ctrlKey: true, shiftKey: true })))
      .toEqual({ type: 'shortcut', value: 'Ctrl+Shift+Q' })

    expect(captureShortcut(keyEvent({ key: '1', code: 'Numpad1', altKey: true })))
      .toEqual({ type: 'shortcut', value: 'Alt+Num1' })

    expect(captureShortcut(keyEvent({ key: 'F5', code: 'F5', ctrlKey: true })))
      .toEqual({ type: 'shortcut', value: 'Ctrl+F5' })
  })

  it('cancels on Escape, clears on bare Delete, ignores modifiers', () => {
    expect(captureShortcut(keyEvent({ key: 'Escape', code: 'Escape' }))).toEqual({ type: 'cancel' })
    expect(captureShortcut(keyEvent({ key: 'Backspace', code: 'Backspace' }))).toEqual({ type: 'clear' })
    expect(captureShortcut(keyEvent({ key: 'Shift', code: 'ShiftLeft', shiftKey: true }))).toEqual({ type: 'ignore' })
    expect(captureShortcut(keyEvent({ key: 'q', code: 'KeyQ' }))).toEqual({ type: 'invalid' })
    expect(captureShortcut(keyEvent({ key: 'Unidentified', code: 'IntlBackslash' }))).toEqual({ type: 'ignore' })
  })
})
