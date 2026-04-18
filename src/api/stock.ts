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
