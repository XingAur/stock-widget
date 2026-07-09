export interface StockPosition {
  costPrice: number
  shares: number
}

export interface FundPosition {
  holdingAmount: number
  profit: number
}

export interface StockQuoteForSummary {
  code: string
  price: number
  changePercent?: number | null
}

export interface PositionMetrics {
  costAmount: number
  currentValue: number
  profit: number
  profitPercent: number
}

export interface FundQuoteForSummary {
  code: string
  estimateChangePercent?: number | null
}

export interface FundAccountSummary {
  accountAssets: number
  estimatedDailyProfit: number | null
  totalProfit: number
  positionCount: number
  estimatedDailyProfitCount: number
}

export interface StockAccountSummary {
  accountAssets: number
  estimatedDailyProfit: number | null
  totalProfit: number
  positionCount: number
  estimatedDailyProfitCount: number
}

export type ProfitTone = 'profit' | 'loss' | 'flat'

function isUsableNumber(value: number): boolean {
  return Number.isFinite(value)
}

function roundMoney(value: number): number {
  return Number(value.toFixed(2))
}

function roundPercent(value: number): number {
  return Number(value.toFixed(2))
}

export function calculateStockPositionMetrics(
  position: StockPosition | undefined,
  currentPrice: number
): PositionMetrics | null {
  if (
    !position
    || !isUsableNumber(position.costPrice)
    || !isUsableNumber(position.shares)
    || !isUsableNumber(currentPrice)
    || position.costPrice <= 0
    || position.shares <= 0
  ) {
    return null
  }

  const costAmount = position.costPrice * position.shares
  const currentValue = currentPrice * position.shares
  const profit = currentValue - costAmount

  return {
    costAmount: roundMoney(costAmount),
    currentValue: roundMoney(currentValue),
    profit: roundMoney(profit),
    profitPercent: roundPercent((profit / costAmount) * 100)
  }
}

export function calculateFundPositionMetrics(position: FundPosition | undefined): PositionMetrics | null {
  if (
    !position
    || !isUsableNumber(position.holdingAmount)
    || !isUsableNumber(position.profit)
    || position.holdingAmount <= 0
  ) {
    return null
  }

  const costAmount = position.holdingAmount - position.profit
  if (costAmount <= 0) {
    return null
  }

  return {
    costAmount: roundMoney(costAmount),
    currentValue: roundMoney(position.holdingAmount),
    profit: roundMoney(position.profit),
    profitPercent: roundPercent((position.profit / costAmount) * 100)
  }
}

function calculateEstimatedDailyProfit(currentValue: number, estimateChangePercent: number | undefined | null): number | null {
  if (!isUsableNumber(currentValue) || !isUsableNumber(estimateChangePercent ?? Number.NaN)) {
    return null
  }

  return roundMoney(currentValue * (estimateChangePercent as number) / 100)
}

export function calculateFundAccountSummary(
  positions: Record<string, FundPosition>,
  funds: readonly FundQuoteForSummary[]
): FundAccountSummary | null {
  const quoteByCode = new Map(funds.map((fund) => [fund.code, fund]))
  let accountAssets = 0
  let estimatedDailyProfit = 0
  let totalProfit = 0
  let positionCount = 0
  let estimatedDailyProfitCount = 0

  Object.entries(positions).forEach(([code, position]) => {
    const metrics = calculateFundPositionMetrics(position)
    if (!metrics) {
      return
    }

    accountAssets += metrics.currentValue
    totalProfit += metrics.profit
    positionCount += 1

    const dailyProfit = calculateEstimatedDailyProfit(
      metrics.currentValue,
      quoteByCode.get(code)?.estimateChangePercent
    )
    if (dailyProfit !== null) {
      estimatedDailyProfit += dailyProfit
      estimatedDailyProfitCount += 1
    }
  })

  if (positionCount === 0) {
    return null
  }

  return {
    accountAssets: roundMoney(accountAssets),
    estimatedDailyProfit: estimatedDailyProfitCount > 0 ? roundMoney(estimatedDailyProfit) : null,
    totalProfit: roundMoney(totalProfit),
    positionCount,
    estimatedDailyProfitCount
  }
}

export function calculateStockAccountSummary(
  positions: Record<string, StockPosition>,
  stocks: readonly StockQuoteForSummary[]
): StockAccountSummary | null {
  const quoteByCode = new Map(stocks.map((stock) => [stock.code, stock]))
  let accountAssets = 0
  let estimatedDailyProfit = 0
  let totalProfit = 0
  let positionCount = 0
  let estimatedDailyProfitCount = 0

  Object.entries(positions).forEach(([code, position]) => {
    const quote = quoteByCode.get(code)
    if (!quote) {
      return
    }

    const metrics = calculateStockPositionMetrics(position, quote.price)
    if (!metrics) {
      return
    }

    accountAssets += metrics.currentValue
    totalProfit += metrics.profit
    positionCount += 1

    const dailyProfit = calculateEstimatedDailyProfit(
      metrics.currentValue,
      quote.changePercent
    )
    if (dailyProfit !== null) {
      estimatedDailyProfit += dailyProfit
      estimatedDailyProfitCount += 1
    }
  })

  if (positionCount === 0) {
    return null
  }

  return {
    accountAssets: roundMoney(accountAssets),
    estimatedDailyProfit: estimatedDailyProfitCount > 0 ? roundMoney(estimatedDailyProfit) : null,
    totalProfit: roundMoney(totalProfit),
    positionCount,
    estimatedDailyProfitCount
  }
}

export function getProfitTone(value: number): ProfitTone {
  if (value > 0) {
    return 'profit'
  }

  if (value < 0) {
    return 'loss'
  }

  return 'flat'
}
