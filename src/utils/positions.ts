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
  prevClose?: number | null
}

export interface PositionMetrics {
  costAmount: number
  currentValue: number
  profit: number
  profitPercent: number
}

/**
 * 基金账户汇总用的持仓：份额缺失时（旧版仅录入金额的持仓）无法计算当日收益。
 */
export interface FundPositionForSummary {
  shares: number | null
  currentValue: number
  profit: number
}

export interface FundQuoteForSummary {
  code: string
  /** 今日盘中估算净值；没有估算时为空，当日收益不可得 */
  estimateNav?: number | null
  /** 最近一个净值日的官方净值（估算涨跌的基准） */
  officialNav?: number | null
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

/**
 * 主流口径（支付宝/天天基金）：
 * 当日（估算）收益 =（当前价 - 上一收盘/净值价）× 份额。
 * 以份额与价差直接相乘，而不是"当前市值 × 涨跌幅"，后者会把当日涨幅重复计入基数。
 */
function calculateEstimatedDailyProfit(
  shares: number | null,
  currentPrice: number,
  previousPrice: number | undefined | null
): number | null {
  if (shares === null || shares <= 0 || !isUsableNumber(currentPrice)) {
    return null
  }
  if (!isUsableNumber(previousPrice ?? Number.NaN) || (previousPrice as number) <= 0) {
    return null
  }

  return roundMoney((currentPrice - (previousPrice as number)) * shares)
}

export function calculateFundAccountSummary(
  positions: Record<string, FundPositionForSummary>,
  funds: readonly FundQuoteForSummary[]
): FundAccountSummary | null {
  const quoteByCode = new Map(funds.map((fund) => [fund.code, fund]))
  let accountAssets = 0
  let estimatedDailyProfit = 0
  let totalProfit = 0
  let positionCount = 0
  let estimatedDailyProfitCount = 0

  Object.entries(positions).forEach(([code, position]) => {
    accountAssets += position.currentValue
    totalProfit += position.profit
    positionCount += 1

    const quote = quoteByCode.get(code)
    const dailyProfit = calculateEstimatedDailyProfit(
      position.shares,
      quote?.estimateNav ?? Number.NaN,
      quote?.officialNav
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
      position.shares,
      quote.price,
      quote.prevClose
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
