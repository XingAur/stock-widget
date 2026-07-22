import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const appVue = readFileSync(new URL('./App.vue', import.meta.url), 'utf8')
const homeVue = readFileSync(new URL('./views/Home.vue', import.meta.url), 'utf8')
const fundDetailVue = readFileSync(new URL('./views/FundDetail.vue', import.meta.url), 'utf8')

describe('asset-aware detail routing', () => {
  it('loads stock and fund details from one typed selection', () => {
    expect(appVue).toContain("const FundDetailView = defineAsyncComponent(() => import('./views/FundDetail.vue'))")
    expect(appVue).toContain('const selectedDetail = ref<DetailSelection | null>(null)')
    expect(appVue).toContain("selectedDetail?.assetType === 'stock'")
    expect(appVue).toContain("selectedDetail?.assetType === 'fund'")
  })

  it('emits the asset type when a stock or fund card is opened', () => {
    expect(homeVue).toContain("emit('selectDetail', { assetType: 'stock', code })")
    expect(homeVue).toContain("emit('selectDetail', { assetType: 'fund', code })")
  })

  it('provides a fund detail loading surface for the route', () => {
    expect(fundDetailVue).toContain('基金详情加载中')
    expect(fundDetailVue).toContain("defineProps<{ code: string }>()")
  })

  it('shows fund sectors in the list and keeps quote-source labels in details', () => {
    expect(homeVue).toContain('resolveFundDisplayQuote')
    expect(homeVue).toContain("fund.sector || '板块待更新'")
    expect(fundDetailVue).toContain('持仓估算')
    expect(fundDetailVue).toContain('已确认净值')
    expect(homeVue).toContain("display.source === 'estimate'")
  })
})
