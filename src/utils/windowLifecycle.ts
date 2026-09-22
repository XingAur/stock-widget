export const WEBVIEW_RECOVERY_STORAGE_KEY = 'webviewRecoveryAt'
const RECOVERY_COOLDOWN_MS = 15_000

export function isPageVisible(doc: Pick<Document, 'visibilityState'> | Document | undefined = typeof document === 'undefined' ? undefined : document): boolean {
  if (!doc) {
    return true
  }

  return doc.visibilityState !== 'hidden'
}

export function onPageVisibilityChange(listener: (visible: boolean) => void): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') {
    return () => {}
  }

  const onVisibilityChange = () => {
    listener(isPageVisible())
  }
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) {
      listener(true)
    }
  }

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('pageshow', onPageShow)

  return () => {
    document.removeEventListener('visibilitychange', onVisibilityChange)
    window.removeEventListener('pageshow', onPageShow)
  }
}

export function kickWebViewPaint(root: HTMLElement | null = typeof document === 'undefined' ? null : document.documentElement): void {
  if (!root) {
    return
  }

  const previous = root.style.transform
  root.style.transform = 'translateZ(0)'
  void root.offsetHeight
  root.style.transform = previous
}

export function isAppShellMounted(root: ParentNode | null = typeof document === 'undefined' ? null : document.getElementById('app')): boolean {
  return Boolean(root && root.childElementCount > 0)
}

function readRecoveryTimestamp(storage: Pick<Storage, 'getItem'> | null): number {
  if (!storage) {
    return 0
  }

  const parsed = Number(storage.getItem(WEBVIEW_RECOVERY_STORAGE_KEY) || '0')
  return Number.isFinite(parsed) ? parsed : 0
}

export function reloadIfAppShellMissing(
  root: ParentNode | null = typeof document === 'undefined' ? null : document.getElementById('app'),
  reload: () => void = () => window.location.reload(),
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = typeof sessionStorage === 'undefined' ? null : sessionStorage,
  now = Date.now()
): boolean {
  if (isAppShellMounted(root)) {
    return false
  }

  const lastRecoveryAt = readRecoveryTimestamp(storage)
  if (lastRecoveryAt > 0 && now - lastRecoveryAt < RECOVERY_COOLDOWN_MS) {
    return false
  }

  storage?.setItem(WEBVIEW_RECOVERY_STORAGE_KEY, String(now))
  reload()
  return true
}
