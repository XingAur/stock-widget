import { invoke } from '@tauri-apps/api/core'

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
}

export interface StockDetail extends Stock {
  kline?: KlineData[]
  minute?: MinuteData[]
}

export interface KlineData {
  time: string
  open: number
  close: number
  high: number
  low: number
  volume: number
}

export interface MinuteData {
  time: string
  price: number
  volume: number
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

// 通过Tauri后端获取股票数据
export async function fetchStocks(codes: string[]): Promise<Stock[]> {
  if (codes.length === 0) return []
  try {
    return await invoke<Stock[]>('fetch_stocks', { codes })
  } catch (error) {
    console.error('Fetch stocks error:', error)
    return []
  }
}

// 通过Tauri后端搜索股票
export async function searchStock(keyword: string): Promise<SearchResult[]> {
  if (!keyword.trim()) return []
  try {
    return await invoke<SearchResult[]>('search_stock', { keyword })
  } catch (error) {
    console.error('Search stock error:', error)
    return []
  }
}

// 获取分时数据 (Rust后端)
export async function fetchMinuteData(code: string): Promise<MinuteData[]> {
  try {
    return await invoke<MinuteData[]>('fetch_minute_data', { code })
  } catch (e) {
    console.warn('Fetch minute data error:', e)
    return []
  }
}

// 获取K线数据 (Rust后端)
export async function fetchKlineData(code: string, type: string = 'day'): Promise<KlineData[]> {
  try {
    return await invoke<KlineData[]>('fetch_kline_data', { code, ktype: type })
  } catch (e) {
    console.warn('Fetch kline data error:', e)
    return []
  }
}

// 获取股票详情（包含分时数据）
export async function fetchStockDetail(code: string): Promise<StockDetail | null> {
  try {
    const stocks = await fetchStocks([code])
    if (stocks.length === 0) return null
    const stock = stocks[0]
    const minute = await fetchMinuteData(code)
    return { ...stock, minute }
  } catch (error) {
    console.error('Fetch stock detail error:', error)
    return null
  }
}

// 获取三大指数数据
export async function fetchIndices(): Promise<IndexData[]> {
  try {
    return await invoke<IndexData[]>('fetch_indices')
  } catch (error) {
    console.error('Fetch indices error:', error)
    return []
  }
}
