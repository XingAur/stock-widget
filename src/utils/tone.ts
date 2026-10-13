import type { ProfitTone } from './positions'

/** coolove-ui 的涨跌语义：rise / fall，具体红绿由 data-trend 决定 */
export type TrendTone = '' | 'rise' | 'fall'

/** getSignedChangeTone 的 up/down → rise/fall */
export function changeToneToTrend(tone: '' | 'up' | 'down'): TrendTone {
  return tone === 'up' ? 'rise' : tone === 'down' ? 'fall' : ''
}

/** getProfitTone 的 profit/loss/flat → rise/fall/flat */
export function profitToneToTrend(tone: ProfitTone): 'rise' | 'fall' | 'flat' {
  return tone === 'profit' ? 'rise' : tone === 'loss' ? 'fall' : 'flat'
}
