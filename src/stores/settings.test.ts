import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, sanitizeSettings } from './settings'

describe('settings normalization', () => {
  it('keeps valid stored settings', () => {
    const settings = sanitizeSettings({
      alwaysOnTop: true,
      autoStart: true,
      minimizeToTray: false,
      backgroundOpacity: 0,
      theme: 'custom',
      customBgColor: '#123abc',
      customFontColor: '#abcdef',
      fontFamily: 'Arial, sans-serif',
      showIndices: false,
      showSparklines: false,
      nativeGlass: 'acrylic',
      showShortcut: 'Ctrl+Alt+K',
      hideShortcut: 'Ctrl+Alt+H'
    })

    expect(settings).toEqual({
      alwaysOnTop: true,
      autoStart: true,
      minimizeToTray: false,
      backgroundOpacity: 0,
      theme: 'custom',
      customBgColor: '#123abc',
      customFontColor: '#abcdef',
      fontFamily: 'Arial, sans-serif',
      showIndices: false,
      showSparklines: false,
      nativeGlass: 'acrylic',
      showShortcut: 'Ctrl+Alt+K',
      hideShortcut: 'Ctrl+Alt+H'
    })
  })

  it('falls back when persisted values are invalid', () => {
    const settings = sanitizeSettings({
      alwaysOnTop: 'yes',
      autoStart: 1,
      minimizeToTray: null,
      backgroundOpacity: Number.NaN,
      theme: 'broken',
      customBgColor: 'transparent',
      customFontColor: '#fff',
      fontFamily: 123,
      showIndices: 'true',
      showSparklines: [],
      nativeGlass: 'liquid'
    })

    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('normalizes shortcut settings', () => {
    expect(sanitizeSettings({ showShortcut: '', hideShortcut: 'Ctrl+Q' })).toMatchObject({
      showShortcut: '',
      hideShortcut: 'Ctrl+Q'
    })

    expect(sanitizeSettings({ showShortcut: 'Q', hideShortcut: 'bare key' })).toMatchObject({
      showShortcut: DEFAULT_SETTINGS.showShortcut,
      hideShortcut: DEFAULT_SETTINGS.hideShortcut
    })

    // 打开与隐藏相同：隐藏项回落默认值，不能同键注册两次
    expect(sanitizeSettings({ showShortcut: 'Alt+Q', hideShortcut: 'Alt+Q' })).toMatchObject({
      showShortcut: 'Alt+Q',
      hideShortcut: DEFAULT_SETTINGS.hideShortcut
    })
  })
})
