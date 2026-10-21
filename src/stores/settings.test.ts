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
      nativeGlass: 'acrylic'
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
      nativeGlass: 'acrylic'
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
})
