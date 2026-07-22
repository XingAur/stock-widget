import type { FundPosition } from './positions'

const SHARE_EPSILON = 0.000001

export interface FundBaseline {
  date: string
  nav: number
  holdingAmount: number
  holdingProfit: number
  shares: number
  costAmount: number
}

export interface FundBuyTransaction {
  id: string
  type: 'buy'
  tradeDate: string
  nav: number
  amount: number
  shares: number
  feeRate: number
  fee: number
  createdAt: string
}

export interface FundSellTransaction {
  id: string
  type: 'sell'
  tradeDate: string
  nav: number
  shares: number
  feeRate: number
  fee: number
  proceeds: number
  realizedProfit: number
  createdAt: string
}

export interface FundAdjustmentTransaction {
  id: string
  type: 'adjustment'
  tradeDate: string
  nav: number
  holdingAmount: number
  holdingProfit: number
  shares: number
  resetCostAmount: number
  createdAt: string
}

export type FundTransaction =
  | FundBuyTransaction
  | FundSellTransaction
  | FundAdjustmentTransaction

export type FundTransactionInput =
  | Omit<FundBuyTransaction, 'shares' | 'fee'>
  | Omit<FundSellTransaction, 'fee' | 'proceeds' | 'realizedProfit'>
  | Omit<FundAdjustmentTransaction, 'shares' | 'resetCostAmount'>

export interface FundDailySnapshot {
  date: string
  officialNav: number
  shares: number
  remainingCost: number
  marketValue: number
  realizedProfit: number
  totalProfit: number
  dailyProfit: number | null
  hasAdjustment: boolean
}

export interface FundLedger {
  schemaVersion: 1
  code: string
  baseline: FundBaseline
  transactions: FundTransaction[]
  snapshots: FundDailySnapshot[]
}

export interface FundNavPointLike {
  date: string
  nav: number
}

export interface FundPositionView {
  shares: number
  currentValue: number
  remainingCost: number
  holdingProfit: number
  holdingProfitPercent: number
  realizedProfit: number
  totalProfit: number
  costNav: number | null
  holdingDays: number
  positionPercent: number | null
}

interface ReplayState {
  shares: number
  remainingCost: number
  realizedProfit: number
  positionStartDate: string | null
}

export class FundLedgerError extends Error {
  constructor(message: string, readonly tradeDate?: string) {
    super(message)
    this.name = 'FundLedgerError'
  }
}

function round(value: number, digits: number): number {
  return Number(value.toFixed(digits))
}

function roundMoney(value: number): number {
  return round(Math.abs(value) < 0.005 ? 0 : value, 2)
}

function roundShares(value: number): number {
  return round(Math.abs(value) < SHARE_EPSILON ? 0 : value, 6)
}

function roundPercent(value: number): number {
  return round(value, 2)
}

function requirePositive(value: number, label: string, tradeDate?: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new FundLedgerError(`${label}必须大于 0`, tradeDate)
  }
}

function requireFeeRate(value: number, tradeDate?: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    throw new FundLedgerError('费率必须在 0% 到 100% 之间', tradeDate)
  }
}

function sortInputs(inputs: FundTransactionInput[]): FundTransactionInput[] {
  return [...inputs].sort((left, right) => {
    const dateOrder = left.tradeDate.localeCompare(right.tradeDate)
    return dateOrder !== 0 ? dateOrder : left.createdAt.localeCompare(right.createdAt)
  })
}

function toInput(transaction: FundTransaction): FundTransactionInput {
  if (transaction.type === 'buy') {
    const { shares: _shares, fee: _fee, ...input } = transaction
    return input
  }

  if (transaction.type === 'sell') {
    const { fee: _fee, proceeds: _proceeds, realizedProfit: _realizedProfit, ...input } = transaction
    return input
  }

  const { shares: _shares, resetCostAmount: _resetCostAmount, ...input } = transaction
  return input
}

function replayInputs(
  baseline: FundBaseline,
  inputs: FundTransactionInput[],
  throughDate?: string
): { state: ReplayState; transactions: FundTransaction[] } {
  const state: ReplayState = {
    shares: baseline.shares,
    remainingCost: baseline.costAmount,
    realizedProfit: 0,
    positionStartDate: baseline.shares > SHARE_EPSILON ? baseline.date : null
  }
  const transactions: FundTransaction[] = []

  for (const input of sortInputs(inputs)) {
    if (throughDate && input.tradeDate > throughDate) {
      continue
    }

    requirePositive(input.nav, '净值', input.tradeDate)

    if (input.type === 'buy') {
      requirePositive(input.amount, '加仓金额', input.tradeDate)
      requireFeeRate(input.feeRate, input.tradeDate)
      const fee = roundMoney(input.amount * input.feeRate / 100)
      const shares = roundShares((input.amount - fee) / input.nav)
      requirePositive(shares, '确认份额', input.tradeDate)

      if (state.shares <= SHARE_EPSILON) {
        state.positionStartDate = input.tradeDate
      }
      state.shares = roundShares(state.shares + shares)
      state.remainingCost = roundMoney(state.remainingCost + input.amount)
      transactions.push({ ...input, fee, shares })
      continue
    }

    if (input.type === 'sell') {
      requirePositive(input.shares, '卖出份额', input.tradeDate)
      requireFeeRate(input.feeRate, input.tradeDate)
      if (input.shares - state.shares > SHARE_EPSILON) {
        throw new FundLedgerError(`卖出份额超过可用份额 ${roundShares(state.shares)}`, input.tradeDate)
      }

      const soldShares = Math.abs(input.shares - state.shares) <= SHARE_EPSILON
        ? state.shares
        : input.shares
      const averageCost = state.shares > SHARE_EPSILON ? state.remainingCost / state.shares : 0
      const costBasis = roundMoney(averageCost * soldShares)
      const gross = roundMoney(soldShares * input.nav)
      const fee = roundMoney(gross * input.feeRate / 100)
      const proceeds = roundMoney(gross - fee)
      const realizedProfit = roundMoney(proceeds - costBasis)

      state.shares = roundShares(state.shares - soldShares)
      state.remainingCost = state.shares === 0 ? 0 : roundMoney(state.remainingCost - costBasis)
      state.realizedProfit = roundMoney(state.realizedProfit + realizedProfit)
      if (state.shares === 0) {
        state.positionStartDate = null
      }
      transactions.push({ ...input, shares: roundShares(soldShares), fee, proceeds, realizedProfit })
      continue
    }

    requirePositive(input.holdingAmount, '持有金额', input.tradeDate)
    const resetCostAmount = roundMoney(input.holdingAmount - input.holdingProfit)
    requirePositive(resetCostAmount, '持仓成本', input.tradeDate)
    const shares = roundShares(input.holdingAmount / input.nav)

    state.shares = shares
    state.remainingCost = resetCostAmount
    state.realizedProfit = 0
    state.positionStartDate = input.tradeDate
    transactions.push({ ...input, shares, resetCostAmount })
  }

  return { state, transactions }
}

function dateDifferenceInclusive(startDate: string | null, endDate: string): number {
  if (!startDate) {
    return 0
  }

  const start = Date.parse(`${startDate}T00:00:00Z`)
  const end = Date.parse(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0
  }

  return Math.floor((end - start) / 86_400_000) + 1
}

export function createLedgerFromLegacyPosition(
  code: string,
  position: FundPosition,
  date: string,
  nav: number
): FundLedger {
  requirePositive(position.holdingAmount, '持有金额', date)
  requirePositive(nav, '净值', date)
  const costAmount = roundMoney(position.holdingAmount - position.profit)
  requirePositive(costAmount, '持仓成本', date)
  const shares = roundShares(position.holdingAmount / nav)
  const baseline: FundBaseline = {
    date,
    nav,
    holdingAmount: roundMoney(position.holdingAmount),
    holdingProfit: roundMoney(position.profit),
    shares,
    costAmount
  }

  return {
    schemaVersion: 1,
    code,
    baseline,
    transactions: [],
    snapshots: [{
      date,
      officialNav: nav,
      shares,
      remainingCost: costAmount,
      marketValue: baseline.holdingAmount,
      realizedProfit: 0,
      totalProfit: baseline.holdingProfit,
      dailyProfit: null,
      hasAdjustment: false
    }]
  }
}

export function createEmptyFundLedger(code: string, date: string, nav: number): FundLedger {
  requirePositive(nav, '净值', date)
  return {
    schemaVersion: 1,
    code,
    baseline: {
      date,
      nav,
      holdingAmount: 0,
      holdingProfit: 0,
      shares: 0,
      costAmount: 0
    },
    transactions: [],
    snapshots: [{
      date,
      officialNav: nav,
      shares: 0,
      remainingCost: 0,
      marketValue: 0,
      realizedProfit: 0,
      totalProfit: 0,
      dailyProfit: null,
      hasAdjustment: false
    }]
  }
}

export function addFundTransaction(ledger: FundLedger, input: FundTransactionInput): FundLedger {
  if (ledger.transactions.some((transaction) => transaction.id === input.id)) {
    throw new FundLedgerError('交易记录编号重复', input.tradeDate)
  }

  const replayed = replayInputs(
    ledger.baseline,
    [...ledger.transactions.map(toInput), input]
  )
  return {
    ...ledger,
    transactions: replayed.transactions
  }
}

export function replaceFundTransaction(
  ledger: FundLedger,
  id: string,
  input: FundTransactionInput
): FundLedger {
  const index = ledger.transactions.findIndex((transaction) => transaction.id === id)
  if (index === -1) {
    throw new FundLedgerError('未找到要修改的交易记录', input.tradeDate)
  }

  const inputs = ledger.transactions.map(toInput)
  inputs[index] = input
  const replayed = replayInputs(ledger.baseline, inputs)
  return {
    ...ledger,
    transactions: replayed.transactions
  }
}

export function removeFundTransaction(ledger: FundLedger, id: string): FundLedger {
  if (!ledger.transactions.some((transaction) => transaction.id === id)) {
    throw new FundLedgerError('未找到要删除的交易记录')
  }

  const replayed = replayInputs(
    ledger.baseline,
    ledger.transactions
      .filter((transaction) => transaction.id !== id)
      .map(toInput)
  )
  return {
    ...ledger,
    transactions: replayed.transactions
  }
}

export function deriveFundPosition(
  ledger: FundLedger,
  nav: number,
  accountMarketValue = 0,
  asOfDate = new Date().toISOString().slice(0, 10)
): FundPositionView {
  requirePositive(nav, '净值')
  const { state } = replayInputs(ledger.baseline, ledger.transactions.map(toInput))
  const currentValue = roundMoney(state.shares * nav)
  const holdingProfit = roundMoney(currentValue - state.remainingCost)
  const totalProfit = roundMoney(state.realizedProfit + holdingProfit)

  return {
    shares: roundShares(state.shares),
    currentValue,
    remainingCost: roundMoney(state.remainingCost),
    holdingProfit,
    holdingProfitPercent: state.remainingCost > 0
      ? roundPercent(holdingProfit / state.remainingCost * 100)
      : 0,
    realizedProfit: roundMoney(state.realizedProfit),
    totalProfit,
    costNav: state.shares > SHARE_EPSILON
      ? round(state.remainingCost / state.shares, 4)
      : null,
    holdingDays: dateDifferenceInclusive(state.positionStartDate, asOfDate),
    positionPercent: accountMarketValue > 0
      ? roundPercent(currentValue / accountMarketValue * 100)
      : null
  }
}

export function rebuildFundSnapshots(
  ledger: FundLedger,
  history: readonly FundNavPointLike[]
): FundLedger {
  const historyByDate = new Map<string, number>([[ledger.baseline.date, ledger.baseline.nav]])
  history.forEach((point) => {
    if (point.date >= ledger.baseline.date && Number.isFinite(point.nav) && point.nav > 0) {
      historyByDate.set(point.date, point.nav)
    }
  })

  let previousTotalProfit: number | null = null
  const snapshots = [...historyByDate.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, nav]) => {
      const { state } = replayInputs(ledger.baseline, ledger.transactions.map(toInput), date)
      const marketValue = roundMoney(state.shares * nav)
      const totalProfit = roundMoney(state.realizedProfit + marketValue - state.remainingCost)
      const hasAdjustment = ledger.transactions.some(
        (transaction) => transaction.type === 'adjustment' && transaction.tradeDate === date
      )
      const dailyProfit = previousTotalProfit === null || hasAdjustment
        ? null
        : roundMoney(totalProfit - previousTotalProfit)
      previousTotalProfit = totalProfit

      return {
        date,
        officialNav: nav,
        shares: roundShares(state.shares),
        remainingCost: roundMoney(state.remainingCost),
        marketValue,
        realizedProfit: roundMoney(state.realizedProfit),
        totalProfit,
        dailyProfit,
        hasAdjustment
      }
    })

  return {
    ...ledger,
    snapshots
  }
}
