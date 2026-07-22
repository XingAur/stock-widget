import { invoke } from '@tauri-apps/api/core'

export type ChartPeriod = 'day' | 'week' | 'month'

export interface OrderLevel {
  price: number
  volume: number
}

export interface OrderBook {
  bids: OrderLevel[]
  asks: OrderLevel[]
}

export interface Stock {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
  high: number
  low: number
  open: number
  prevClose: number
  volume: number
  amount: number
  time: string
  totalMarketCap: number
  circulationMarketCap: number
  turnoverRate: number
  volumeRatio: number
  orderBook?: OrderBook
}

export interface MinutePoint {
  time: string
  price: number
  volume: number
}

export interface KlinePoint {
  time: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export interface StockDetail extends Stock {
  minute?: MinutePoint[]
  kline?: KlinePoint[]
}

export interface SearchResult {
  code: string
  name: string
  market: string
}

export type AssetType = 'stock' | 'fund'

export interface FundQuote {
  code: string
  name: string
  nav?: number | null
  navDate: string
  changePercent?: number | null
  estimateNav?: number | null
  estimateChangePercent?: number | null
  estimateTime: string
}

export interface FundSearchResult {
  code: string
  name: string
  type: string
}

export interface FundNavPoint {
  date: string
  nav: number
  accumulatedNav: number
  changePercent?: number | null
}

export interface FundRank {
  current: number
  total: number
}

export interface FundProfile {
  code: string
  fundType: string
  riskLevel: string
  oneYearReturn?: number | null
  rank?: FundRank | null
}

export interface FundIndustry {
  name: string
  percent: number
}

export interface FundHolding {
  code: string
  name: string
  percent: number
}

export interface FundAllocation {
  reportDate: string
  industries: FundIndustry[]
  holdings: FundHolding[]
}

export interface IndexData {
  code: string
  name: string
  price: number
  change: number
  changePercent: number
  volume: number
  sparkline: number[]
}

async function invokeSafe<T>(command: string, args: Record<string, unknown> | undefined, fallback: T): Promise<T> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    console.error(`Invoke ${command} error:`, error)
    return fallback
  }
}

export async function fetchStocks(codes: string[]): Promise<Stock[]> {
  if (codes.length === 0) {
    return []
  }

  return invokeSafe('fetch_stocks', { codes }, [])
}

export async function searchStock(keyword: string): Promise<SearchResult[]> {
  if (!keyword.trim()) {
    return []
  }

  return invokeSafe('search_stock', { keyword }, [])
}

export async function searchFunds(keyword: string): Promise<FundSearchResult[]> {
  if (!keyword.trim()) {
    return []
  }

  return invokeSafe('search_funds', { keyword }, [])
}

export async function fetchFunds(codes: string[]): Promise<FundQuote[]> {
  if (codes.length === 0) {
    return []
  }

  return invokeSafe('fetch_funds', { codes }, [])
}

export async function fetchFundHistory(code: string): Promise<FundNavPoint[]> {
  return invoke<FundNavPoint[]>('fetch_fund_history', { code })
}

export async function fetchFundProfile(code: string): Promise<FundProfile> {
  return invoke<FundProfile>('fetch_fund_profile', { code })
}

export async function fetchFundAllocation(code: string): Promise<FundAllocation> {
  return invoke<FundAllocation>('fetch_fund_allocation', { code })
}

export async function fetchIndexHistory(code = 'sh000300'): Promise<KlinePoint[]> {
  const points = await invoke<KlinePoint[]>('fetch_index_history', { code })
  return normalizeKlinePoints(points)
}

export async function fetchMinuteData(code: string): Promise<MinutePoint[]> {
  return invokeSafe('fetch_minute_data', { code }, [])
}

function getKlineTimestamp(value: string): number {
  const parsed = Date.parse(value.includes('T') ? value : `${value}T00:00:00`)
  return Number.isFinite(parsed) ? parsed : 0
}

function normalizeKlinePoints(points: KlinePoint[]): KlinePoint[] {
  return [...points].sort((left, right) => getKlineTimestamp(left.time) - getKlineTimestamp(right.time))
}

export async function fetchKlineData(code: string, period: ChartPeriod = 'day'): Promise<KlinePoint[]> {
  const points = await invokeSafe('fetch_kline_data', { code, ktype: period }, [])
  return normalizeKlinePoints(points)
}

export async function fetchStockDetail(code: string): Promise<StockDetail | null> {
  const [stocks, minute] = await Promise.all([
    fetchStocks([code]),
    fetchMinuteData(code)
  ])

  if (stocks.length === 0) {
    return null
  }

  return {
    ...stocks[0],
    minute
  }
}

export async function fetchIndices(): Promise<IndexData[]> {
  return invokeSafe('fetch_indices', undefined, [])
}
