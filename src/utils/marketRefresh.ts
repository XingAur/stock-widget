import type { GlobalIndexData, MarketKey } from '../api/stock'

// 仅保存本次运行中已成功取得的数据，市场/行业/概念分别缓存。
const snapshots = new Map<MarketKey, { data: GlobalIndexData[]; updatedAt: Date }>()

export function readMarketSnapshot(key: MarketKey) {
  return snapshots.get(key)
}

export function saveMarketSnapshot(key: MarketKey, data: GlobalIndexData[], updatedAt: Date) {
  snapshots.set(key, { data, updatedAt })
}

export function marketProvider(key: MarketKey): string {
  return ['cn', 'hk', 'us'].includes(key) ? '腾讯行情' : '东方财富'
}

export function marketErrorMessage(key: MarketKey, error: unknown): string {
  const detail = error instanceof Error ? error.message : String(error)
  const provider = marketProvider(key)
  if (/timeout|timed out|超时/i.test(detail)) return `${provider}请求超时`
  if (/\b(502|503|504)\b/.test(detail)) return `${provider}服务暂时不可用`
  if (/\b(403|429)\b/.test(detail)) return `${provider}暂时拒绝请求，请稍后重试`
  if (/无有效行情|未返回数据|JSON|数据格式|数据结构|业务错误/.test(detail)) return `${provider}暂未返回有效行情`
  return `${provider}连接失败，请检查网络后重试`
}

/** 失败后最多自动重试三次，避免持续故障时无限请求；手动刷新可以开启新一轮。 */
export function marketRefreshDelay(failures: number, open: boolean): number | null {
  if (failures > 0) return [15_000, 30_000, 60_000][failures - 1] ?? null
  // 低频检查休市行情，避免跨交易日停留时永不恢复轮询。
  return open ? 60_000 : 300_000
}
