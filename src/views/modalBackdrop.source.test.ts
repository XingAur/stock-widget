import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

function cssRule(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = source.match(new RegExp(`(?:^|\\n)${escapedSelector}\\s*\\{([^}]*)\\}`))
  expect(match, `missing CSS rule ${selector}`).not.toBeNull()
  return match?.[1] ?? ''
}

const cooloveCss = read('../coolove-ui/coolove-ui.css')

describe('modal backdrops', () => {
  it('coolove-ui backdrop dims the window without blurring it', () => {
    const rule = cssRule(cooloveCss, '.cl-backdrop')

    expect(rule).not.toContain('backdrop-filter')
    expect(rule).toContain('background:')
  })

  it.each([
    ['../App.vue', 'settings-overlay'],
    ['../components/watchlist/WatchlistPositionDialog.vue', 'position-overlay'],
    ['./FundDetail.vue', 'action-overlay']
  ])('%s %s uses the shared contained backdrop', (path, overlayClass) => {
    expect(read(path)).toMatch(new RegExp(`class="cl-backdrop cl-backdrop--contained [^"]*${overlayClass}`))
  })
})
