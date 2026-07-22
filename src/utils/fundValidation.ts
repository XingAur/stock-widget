import type { FundNavPointLike } from './fundLedger'

export type FundPositionFormMode = 'buy' | 'sell' | 'adjust'

export interface FundPositionFormValues {
  amount?: number
  shares?: number
  holdingAmount?: number
  holdingProfit?: number
  feeRate?: number
  nav: number
  tradeDate: string
}

export interface MatchedFundNav {
  date: string
  nav: number
  shifted: boolean
}

function isPositive(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value > 0
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

export function validateFundPositionForm(
  mode: FundPositionFormMode,
  values: FundPositionFormValues,
  availableShares = 0,
  currentDate = new Date().toISOString().slice(0, 10),
  minimumDate = ''
): string[] {
  const errors: string[] = []

  if (!values.tradeDate) {
    errors.push('请选择交易日期')
  } else if (minimumDate && values.tradeDate < minimumDate) {
    errors.push(`交易日期不能早于账本期初 ${minimumDate}`)
  } else if (values.tradeDate > currentDate) {
    errors.push('交易日期不能晚于今天')
  }
  if (!isPositive(values.nav)) {
    errors.push('确认净值必须大于 0')
  }

  if (mode === 'buy') {
    if (!isPositive(values.amount)) errors.push('加仓金额必须大于 0')
  } else if (mode === 'sell') {
    if (!isPositive(values.shares)) {
      errors.push('卖出份额必须大于 0')
    } else if (values.shares > availableShares + 0.000001) {
      errors.push(`卖出份额不能超过可用份额 ${round(availableShares, 6)}`)
    }
  } else {
    if (!isPositive(values.holdingAmount)) errors.push('持有金额必须大于 0')
    if (!Number.isFinite(values.holdingProfit)) errors.push('持有收益必须是有效数字')
    if (
      isPositive(values.holdingAmount)
      && Number.isFinite(values.holdingProfit)
      && values.holdingAmount - (values.holdingProfit as number) <= 0
    ) {
      errors.push('持仓成本必须大于 0')
    }
  }

  if (mode !== 'adjust') {
    const feeRate = values.feeRate
    if (feeRate === undefined || !Number.isFinite(feeRate) || feeRate < 0 || feeRate > 100) {
      errors.push('费率必须在 0% 到 100% 之间')
    }
  }

  return errors
}

export function calculateBuyPreview(amount: number, feeRate: number, nav: number): { fee: number; shares: number } {
  const fee = round(amount * feeRate / 100, 2)
  return {
    fee,
    shares: round((amount - fee) / nav, 6)
  }
}

export function calculateSellPreview(
  shares: number,
  nav: number,
  feeRate: number,
  averageCostNav: number
): { fee: number; proceeds: number; realizedProfit: number } {
  const gross = round(shares * nav, 2)
  const fee = round(gross * feeRate / 100, 2)
  const proceeds = round(gross - fee, 2)
  return {
    fee,
    proceeds,
    realizedProfit: round(proceeds - shares * averageCostNav, 2)
  }
}

export function findNavOnOrBefore(
  history: readonly FundNavPointLike[],
  date: string
): MatchedFundNav | null {
  const matched = [...history]
    .filter((point) => point.date <= date && Number.isFinite(point.nav) && point.nav > 0)
    .sort((left, right) => right.date.localeCompare(left.date))[0]

  return matched ? { ...matched, shifted: matched.date !== date } : null
}
