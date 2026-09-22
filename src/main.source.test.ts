import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const mainTs = readFileSync(new URL('./main.ts', import.meta.url), 'utf8')

describe('app bootstrap recovery', () => {
  it('installs a vue error handler that can recover a blank shell', () => {
    expect(mainTs).toContain('app.config.errorHandler')
    expect(mainTs).toContain('reloadIfAppShellMissing')
  })
})
