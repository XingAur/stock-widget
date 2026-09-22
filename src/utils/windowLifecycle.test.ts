// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  WEBVIEW_RECOVERY_STORAGE_KEY,
  isAppShellMounted,
  isPageVisible,
  kickWebViewPaint,
  onPageVisibilityChange,
  reloadIfAppShellMissing
} from './windowLifecycle'

describe('window lifecycle recovery', () => {
  afterEach(() => {
    sessionStorage.clear()
    document.body.innerHTML = ''
    vi.restoreAllMocks()
  })

  it('treats missing documents as visible and hidden documents as not visible', () => {
    expect(isPageVisible(undefined)).toBe(true)
    expect(isPageVisible({ visibilityState: 'visible' })).toBe(true)
    expect(isPageVisible({ visibilityState: 'hidden' })).toBe(false)
  })

  it('notifies listeners when visibility changes and when a persisted page is restored', () => {
    const listener = vi.fn()
    const stop = onPageVisibilityChange(listener)

    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pageshow'))
    const persistedShow = new Event('pageshow')
    Object.defineProperty(persistedShow, 'persisted', { value: true })
    window.dispatchEvent(persistedShow)

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener).toHaveBeenNthCalledWith(1, document.visibilityState !== 'hidden')
    expect(listener).toHaveBeenNthCalledWith(2, true)

    stop()
    document.dispatchEvent(new Event('visibilitychange'))
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('forces a compositor paint without leaving a transform behind', () => {
    const root = document.createElement('div')
    root.style.transform = ''
    kickWebViewPaint(root)
    expect(root.style.transform).toBe('')
  })

  it('reloads once when the app shell is missing and ignores a warm cooldown', () => {
    const host = document.createElement('div')
    const reload = vi.fn()
    const storage = sessionStorage

    expect(isAppShellMounted(host)).toBe(false)
    expect(reloadIfAppShellMissing(host, reload, storage, 1_000)).toBe(true)
    expect(reload).toHaveBeenCalledTimes(1)
    expect(storage.getItem(WEBVIEW_RECOVERY_STORAGE_KEY)).toBe('1000')

    expect(reloadIfAppShellMissing(host, reload, storage, 10_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)

    host.appendChild(document.createElement('span'))
    expect(reloadIfAppShellMissing(host, reload, storage, 30_000)).toBe(false)
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
