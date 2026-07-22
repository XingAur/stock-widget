import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const stockApi = readFileSync(new URL('./stock.ts', import.meta.url), 'utf8')

describe('fund detail API source', () => {
  it('exposes explicit-error fund detail commands', () => {
    expect(stockApi).toContain("invoke<FundNavPoint[]>('fetch_fund_history', { code })")
    expect(stockApi).toContain("invoke<FundProfile>('fetch_fund_profile', { code })")
    expect(stockApi).toContain("invoke<FundAllocation>('fetch_fund_allocation', { code })")
    expect(stockApi).toContain("invoke<KlinePoint[]>('fetch_index_history', { code })")
  })
})
