/** K 线当日缓存（阶段F-36，自 quant.ts 拆分） */

import { fetchQuantKline, type KlinePoint } from '../../api/stock'
import type { QuantKlineBundle } from './types'

/* ------------------------------------------------------------------ */
/* K 线当日缓存：历史 K 线收盘后不变，当日内重复进入量化页不重复请求 */


const klineCache = new Map<string, { day: string; points: KlinePoint[] }>()

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** 手动失效缓存（阶段F-38）：刷新按钮真正重取数据。 */
export function invalidateQuantCache(): void {
  klineCache.clear()
}

/** 当前缓存的日期标签（调试/测试用）。 */
export function quantCacheDay(): string | null {
  const first = [...klineCache.values()][0]
  return first?.day ?? null
}

export async function loadQuantKlineBundle(codes: string[]): Promise<QuantKlineBundle> {
  const today = todayKey()
  const adjusted: Record<string, KlinePoint[]> = {}
  const missing: string[] = []

  for (const code of codes) {
    const cachedAdj = klineCache.get(code)
    if (cachedAdj && cachedAdj.day === today) {
      adjusted[code] = cachedAdj.points
    } else {
      missing.push(code)
    }
  }

  if (missing.length > 0) {
    // 大自选池限流，避免同时向行情接口发起几十个请求。
    let cursor = 0
    const worker = async () => {
      while (cursor < missing.length) {
        const code = missing[cursor++]
        const points = await fetchQuantKline(code)
        if (points.length > 0) {
          klineCache.set(code, { day: today, points })
          adjusted[code] = points
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(8, missing.length) }, worker))
  }
  return { adjusted }
}
