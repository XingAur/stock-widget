/** 兼容出口（阶段F-36 拆分后保留旧路径） */

export type { BacktestConfig, BacktestResult, FactorRow, QuantKlineBundle } from './quant/types'
export { MOM_WEIGHT, REV_WEIGHT, momentum20, reversal5, volatility20, computeFactorRows } from './quant/factors'
export {
  DEFAULT_BACKTEST_CONFIG,
  runEqualWeightBacktest,
  isLimitUpDay,
  isLimitDownDay,
  limitRatioOf,
} from './quant/backtest'
export { loadQuantKlineBundle } from './quant/cache'
