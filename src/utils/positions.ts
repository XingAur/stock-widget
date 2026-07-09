export interface StockPosition {
  costPrice: number
  shares: number
}

export interface FundPosition {
  holdingAmount: number
  profit: number
}

export interface PositionMetrics {
  costAmount: number
  currentValue: number
  profit: number
  profitPercent: number
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

export function getProfitTone(value: number): ProfitTone {
  if (value > 0) {
    return 'profit'
  }

  if (value < 0) {
    return 'loss'
  }

  return 'flat'
}
