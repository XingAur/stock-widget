import type { FundQuote } from '../api/stock'

export type FundQuoteSource = 'estimate' | 'official'

export interface FundDisplayQuote {
  nav: number | null
  changePercent: number | null
  time: string
  source: FundQuoteSource
}

export function localDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-')
}

export function estimateDateKey(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 8)
  return digits.length === 8
    ? `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`
    : ''
}

export function resolveFundDisplayQuote(quote: FundQuote, now = new Date()): FundDisplayQuote {
  const hasCurrentEstimate = Number.isFinite(quote.estimateNav)
    && (quote.estimateNav ?? 0) > 0
    && estimateDateKey(quote.estimateTime) === localDateKey(now)

  if (hasCurrentEstimate) {
    return {
      nav: quote.estimateNav ?? null,
      changePercent: quote.estimateChangePercent ?? null,
      time: quote.estimateTime,
      source: 'estimate'
    }
  }

  return {
    nav: quote.nav ?? null,
    changePercent: quote.changePercent ?? null,
    time: quote.navDate,
    source: 'official'
  }
}
