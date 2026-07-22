import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const homeVue = readFileSync(new URL('./Home.vue', import.meta.url), 'utf8')

describe('fund list metadata', () => {
  it('shows the fund sector instead of quote confirmation time', () => {
    expect(homeVue).toContain("return fund.sector || '板块待更新'")
    expect(homeVue).not.toContain('已确认净值${date')
    expect(homeVue).not.toContain('持仓估算${time')
  })
})
