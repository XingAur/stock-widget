import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(new URL('./FundDetail.vue', import.meta.url), 'utf8')

describe('FundDetail source', () => {
  it('provides the complete chart-first fund detail structure', () => {
    expect(source).toContain('关联板块')
    expect(source).toContain('业绩走势')
    expect(source).toContain('我的收益')
    expect(source).toContain('FundRelatedHoldings')
    expect(source).toContain('FundPerformanceChart')
    expect(source).toContain('FundIncomeChart')
    expect(source).toContain(':history="history"')
  })

  it('loads independent fund data without turning one failure into a blank page', () => {
    expect(source).toContain('Promise.allSettled')
    expect(source).toContain('fetchFundHistory')
    expect(source).toContain('fetchFundProfile')
    expect(source).toContain('fetchFundAllocation')
    expect(source).toContain('fetchIndexHistory')
    expect(source).toContain('ensureFundLedger')
    expect(source).toContain('rebuildFundLedgerSnapshots')
  })

  it('exposes position actions and distinguishes confirmed NAV from estimates', () => {
    expect(source).toContain('加仓')
    expect(source).toContain('减仓')
    expect(source).toContain('交易记录')
    expect(source).toContain('修改持仓')
    expect(source).toContain('更多')
    expect(source).toContain('已确认净值')
    expect(source).toContain('持仓估算')
    expect(source).toContain('resolveFundDisplayQuote')
    expect(source).toContain("displayQuote.value?.source === 'estimate'")
  })

  it('connects action dialogs to the persistent fund ledger', () => {
    expect(source).toContain('FundPositionDialog')
    expect(source).toContain('FundTransactionList')
    expect(source).toContain('stockStore.applyFundTransaction')
    expect(source).toContain('stockStore.editFundTransaction')
    expect(source).toContain('stockStore.deleteFundTransaction')
    expect(source).toContain('stockStore.ensureFundLedger(props.code, input.tradeDate, input.nav, true)')
    expect(source).toContain('dialogAvailableShares')
    expect(source).toContain(':minimum-trade-date="ledger?.baseline.date || \'\'"')
    expect(source).toContain('const nav = code === props.code')
    expect(source).toContain('transactionHistory')
    expect(source).toContain('quote.value.navDate >= historyDate')
    expect(source).toContain('officialNavDate')
    expect(source).toContain("watch(() => stockStore.getFund(props.code)")
  })

  it('uses fresh remote caches and retains stale data as an offline fallback', () => {
    expect(source).toContain('readFundDetailCache')
    expect(source).toContain('writeFundDetailCache')
    expect(source).toContain('HISTORY_CACHE_TTL')
    expect(source).toContain('ALLOCATION_CACHE_TTL')
    expect(source).toContain('loadFundDetail(true)')
  })

  it('invalidates allocation cache entries created before the UTF-8 holdings fix', () => {
    expect(source).toContain("const ALLOCATION_CACHE_SCOPE = 'allocation-v2'")
    expect(source).toContain("readFundDetailCache<FundAllocation>(ALLOCATION_CACHE_SCOPE")
    expect(source).toContain("writeFundDetailCache(ALLOCATION_CACHE_SCOPE")
  })
})
