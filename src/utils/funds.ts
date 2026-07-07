import type { FundQuote, FundSearchResult } from '../api/stock'

export function findExactFundSearchResult(results: FundSearchResult[], code: string): FundSearchResult | null {
  const normalizedCode = code.trim()
  return results.find((result) => result.code === normalizedCode) ?? null
}

export function applyFundDisplayName(
  fund: FundQuote,
  searchResult?: FundSearchResult,
  existingFund?: FundQuote
): FundQuote {
  const name = searchResult?.name.trim() || existingFund?.name.trim() || fund.name

  return {
    ...fund,
    name
  }
}

export function formatFundHeaderDate(funds: FundQuote[]): string {
  const source = funds.find((fund) => fund.estimateTime || fund.navDate)
  const dateText = source?.estimateTime || source?.navDate || ''
  const match = dateText.match(/\d{4}-(\d{2})-(\d{2})/)

  return match ? `${match[1]}-${match[2]}` : '--'
}
