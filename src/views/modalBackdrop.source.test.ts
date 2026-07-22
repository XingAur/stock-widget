import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function cssRule(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))
  expect(match, `missing CSS rule ${selector}`).not.toBeNull()
  return match?.[1] ?? ''
}

describe('modal backdrops', () => {
  it.each([
    ['../App.vue', '.settings-overlay'],
    ['./Home.vue', '.position-overlay'],
    ['./FundDetail.vue', '.action-overlay']
  ])('%s %s keeps the background sharp', (path, selector) => {
    const rule = cssRule(read(path), selector)

    expect(rule).not.toContain('backdrop-filter')
    expect(rule).toContain('background:')
  })
})
