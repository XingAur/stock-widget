import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const readProjectFile = (path: string) => readFileSync(path, 'utf8')

describe('NSIS installer defaults', () => {
  it('checks the D drive using a directory wildcard before defaulting the install path', () => {
    const installerTemplate = readProjectFile('src-tauri/nsis/installer.nsi')
    const installerHooks = readProjectFile('src-tauri/nsis/hooks.nsh')
    const validDirectoryCheck = '${FileExists} "D:' + '\\' + '*.*"'
    const invalidRootCheck = '${FileExists} "D:' + '\\' + '"'

    expect(installerTemplate).toContain(validDirectoryCheck)
    expect(installerTemplate).not.toContain(invalidRootCheck)
    expect(installerHooks.split(validDirectoryCheck)).toHaveLength(3)
    expect(installerHooks).not.toContain(invalidRootCheck)
  })
})
