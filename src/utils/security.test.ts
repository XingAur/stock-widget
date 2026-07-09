import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('Tauri security configuration', () => {
  it('allows Tauri IPC in connect-src for installed WebView2 builds', () => {
    const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'))
    const csp = config.app.security.csp as string

    expect(csp).toContain('connect-src')
    expect(csp).toContain('ipc:')
    expect(csp).toContain('http://ipc.localhost')
  })

  it('does not register placeholder command-line arguments for autostart', () => {
    const mainSource = readFileSync('src-tauri/src/main.rs', 'utf8')

    expect(mainSource).not.toContain('--flag1')
    expect(mainSource).not.toContain('--flag2')
  })
})
