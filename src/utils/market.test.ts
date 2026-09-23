import { describe, expect, it } from 'vitest'
import type { GlobalIndexData } from '../api/stock'
import {
  MARKET_GROUPS,
  dataKeyForView,
  defaultViewMode,
  findMarketGroup,
  isOpenMarket,
  lastWatchlistViewType,
  marketViewModeOptions,
  rememberWatchlistView,
  toMarketCardModel
} from './market'

function createIndex(overrides: Partial<GlobalIndexData> = {}): GlobalIndexData {
  return {
    code: 'sh000001',
    name: '上证指数',
    price: 3342.66,
    change: 40.12,
    changePercent: 1.21,
    time: '2026-09-22 14:30:00',
    ...overrides
  }
}

describe('market groups', () => {
  it('orders sector-backed markets first and marks sector availability', () => {
    expect(MARKET_GROUPS.map((group) => group.key)).toEqual(['cn', 'us', 'hk', 'world'])
    expect(MARKET_GROUPS.map((group) => group.label)).toEqual(['A股', '美股', '港股', '全球'])
    expect(MARKET_GROUPS.map((group) => group.hasSectors)).toEqual([true, true, false, false])
  })

  it('falls back to the first group for unknown or legacy keys', () => {
    expect(findMarketGroup('hk').label).toBe('港股')
    expect(findMarketGroup('nonsense').key).toBe('cn')
    expect(findMarketGroup('sectors').key).toBe('cn')
  })

  it('maps each sector-backed market to its sector data key', () => {
    expect(dataKeyForView('cn', 'industry')).toBe('industry-sectors')
    expect(dataKeyForView('cn', 'concept')).toBe('sectors')
    expect(dataKeyForView('us', 'industry')).toBe('us-sectors')
    expect(dataKeyForView('cn', 'indices')).toBe('cn')
    // 纯指数市场无视模式
    expect(dataKeyForView('hk', 'industry')).toBe('hk')
    expect(dataKeyForView('world', 'concept')).toBe('world')
  })

  it('exposes three-way switching for A-shares and two-way for US', () => {
    expect(marketViewModeOptions(true, true).map((option) => option.label)).toEqual(['行业', '概念', '指数'])
    expect(marketViewModeOptions(true, false).map((option) => option.label)).toEqual(['行业', '指数'])
    expect(marketViewModeOptions(false, true)).toEqual([])
  })

  it('defaults to industry sectors for sector-backed markets', () => {
    expect(defaultViewMode('cn')).toBe('industry')
    expect(defaultViewMode('us')).toBe('industry')
    expect(defaultViewMode('hk')).toBe('indices')
    expect(defaultViewMode('world')).toBe('indices')
  })
})

describe('isOpenMarket', () => {
  const quoteTime = Date.parse('2026-09-22T14:30:00+08:00')

  it('treats fresh quotes as an open market', () => {
    expect(isOpenMarket([createIndex()], quoteTime + 5 * 60 * 1000)).toBe(true)
  })

  it('treats quotes older than 30 minutes as closed', () => {
    expect(isOpenMarket([createIndex()], quoteTime + 31 * 60 * 1000)).toBe(false)
  })

  it('uses the freshest quote among all indices', () => {
    const stale = createIndex({ code: 'sz399001', time: '2026-09-22 09:31:00' })
    const fresh = createIndex()
    expect(isOpenMarket([stale, fresh], quoteTime + 10 * 60 * 1000)).toBe(true)
  })

  it('returns closed when no valid quote time exists', () => {
    expect(isOpenMarket([createIndex({ time: '' })])).toBe(false)
    expect(isOpenMarket([])).toBe(false)
  })
})

describe('toMarketCardModel', () => {
  it('formats gainers and losers with signs and arrows', () => {
    const up = toMarketCardModel(createIndex({ changePercent: 1.21, change: 40.12, price: 3342.66 }))
    expect(up.percentText).toBe('+1.21%')
    expect(up.changeText).toBe('+40.12')
    expect(up.priceText).toBe('3,342.66')
    expect(up.up).toBe(true)
    expect(up.down).toBe(false)

    const down = toMarketCardModel(createIndex({ changePercent: -0.87, change: -29.05, price: 3342.66 }))
    expect(down.percentText).toBe('-0.87%')
    expect(down.changeText).toBe('-29.05')
    expect(down.up).toBe(false)
    expect(down.down).toBe(true)
  })

  it('marks flat indices as neither up nor down', () => {
    const flat = toMarketCardModel(createIndex({ changePercent: 0, change: 0 }))
    expect(flat.up).toBe(false)
    expect(flat.down).toBe(false)
    expect(flat.percentText).toBe('+0.00%')
  })

  it('renders member gain/lose counts for concept sectors instead of the index level', () => {
    const sector = toMarketCardModel(
      createIndex({ code: 'BK1127', name: 'AI芯片', gainCount: 86, loseCount: 4 })
    )
    expect(sector.memberText).toBe('涨 86 · 跌 4')
    expect(sector.priceText).toBe('')

    const plainIndex = toMarketCardModel(createIndex())
    expect(plainIndex.memberText).toBe('')
    expect(plainIndex.priceText).toBe('3,342.66')
  })
})

describe('watchlist view memory', () => {
  it('remembers the last watchlist view for globe and quant toggles', () => {
    rememberWatchlistView('fund')
    expect(lastWatchlistViewType()).toBe('fund')

    rememberWatchlistView('market')
    expect(lastWatchlistViewType()).toBe('fund')

    rememberWatchlistView('quant')
    expect(lastWatchlistViewType()).toBe('fund')

    rememberWatchlistView('stock')
    expect(lastWatchlistViewType()).toBe('stock')
  })
})
