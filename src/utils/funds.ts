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
