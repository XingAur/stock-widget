import type { AssetType, GlobalIndexData, MarketKey } from '../api/stock'

export interface MarketGroup {
  key: MarketKey
  label: string
  /** 有板块数据的市场默认显示板块，可一键切换到指数；纯指数市场无切换 */
  hasSectors: boolean
}

export const MARKET_GROUPS: readonly MarketGroup[] = [
  { key: 'cn', label: 'A股', hasSectors: true },
  { key: 'us', label: '美股', hasSectors: true },
  { key: 'hk', label: '港股', hasSectors: false },
  { key: 'world', label: '全球', hasSectors: false }
]

/** 行情时间距现在多久以内视为盘中（分钟）；休市/节假日时行情时间停在收盘，自然判定为休市 */
const OPEN_MARKET_MAX_STALE_MINUTES = 30

/** 地球按钮是开关：记录进入市场页前的自选视图（股票/基金），便于返回 */
let lastWatchlistView: Exclude<AssetType, 'market'> = 'stock'

export function rememberWatchlistView(assetType: AssetType): void {
  if (assetType !== 'market') {
    lastWatchlistView = assetType
  }
}

export function lastWatchlistViewType(): Exclude<AssetType, 'market'> {
  return lastWatchlistView
}

export function findMarketGroup(key: string): MarketGroup {
  return MARKET_GROUPS.find((group) => group.key === key) ?? MARKET_GROUPS[0]
}

/** 板块模式下的行情数据 key：A股用概念板块榜，美股用 SPDR 行业 ETF */
export function sectorDataKey(groupKey: MarketKey): 'sectors' | 'us-sectors' {
  return groupKey === 'us' ? 'us-sectors' : 'sectors'
}

function parseChinaTime(value: string): number {
  const digits = value.replace(/\D/g, '')
  if (digits.length < 12) {
    return Number.NaN
  }

  const iso = `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}T${digits.slice(8, 10)}:${digits.slice(10, 12)}:${digits.slice(12, 14).padEnd(2, '0')}+08:00`
  const parsed = Date.parse(iso)
  return Number.isFinite(parsed) ? parsed : Number.NaN
}

export function isOpenMarket(indices: readonly GlobalIndexData[], now = Date.now()): boolean {
  let latest = Number.NaN
  for (const index of indices) {
    const timestamp = parseChinaTime(index.time)
    if (!Number.isFinite(timestamp)) {
      continue
    }
    latest = Number.isFinite(latest) ? Math.max(latest, timestamp) : timestamp
  }

  if (!Number.isFinite(latest)) {
    return false
  }

  return now - latest < OPEN_MARKET_MAX_STALE_MINUTES * 60 * 1000
}

export interface MarketCardModel {
  code: string
  name: string
  priceText: string
  percentText: string
  changeText: string
  up: boolean
  down: boolean
  /** 概念板块显示成员涨跌家数（如“涨 86 · 跌 4”），指数为空 */
  memberText: string
}

function formatNumber(value: number, digits: number): string {
  return Number.isFinite(value)
    ? value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })
    : '--'
}

export function toMarketCardModel(index: GlobalIndexData): MarketCardModel {
  const percent = index.changePercent
  const hasMemberCounts = typeof index.gainCount === 'number' && typeof index.loseCount === 'number'
  return {
    code: index.code,
    name: index.name,
    priceText: hasMemberCounts ? '' : formatNumber(index.price, 2),
    percentText: `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`,
    changeText: `${percent >= 0 ? '+' : ''}${formatNumber(index.change, 2)}`,
    up: percent > 0,
    down: percent < 0,
    memberText: hasMemberCounts
      ? `涨 ${index.gainCount} · 跌 ${index.loseCount}`
      : ''
  }
}
