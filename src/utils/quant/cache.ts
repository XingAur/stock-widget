/** K 线当日缓存（阶段F-36，自 quant.ts 拆分） */

import { fetchQuantKline, invokeSafe, normalizeKlinePoints, type KlinePoint } from '../../api/stock'
import type { QuantKlineBundle } from './types'

/* ------------------------------------------------------------------ */
/* K 线当日缓存：历史 K 线收盘后不变，当日内重复进入量化页不重复请求 */


const klineCache = new Map<string, { day: string; points: KlinePoint[] }>()

function todayKey(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

const rawCache = new Map<string, { day: string; points: KlinePoint[] }>()

/** 手动失效缓存（阶段F-38）：刷新按钮真正重取数据。 */
export function invalidateQuantCache(): void {
  klineCache.clear()
  rawCache.clear()
}

/** 当前缓存的日期标签（调试/测试用）。 */
export function quantCacheDay(): string | null {
  const first = [...klineCache.values()][0]
  return first?.day ?? null
}

export async function loadQuantKlineBundle(codes: string[]): Promise<QuantKlineBundle> {
  const today = todayKey()
  const adjusted: Record<string, KlinePoint[]> = {}
  const raw: Record<string, KlinePoint[]> = {}
  const missing: string[] = []

  for (const code of codes) {
    const cachedAdj = klineCache.get(code)
    const cachedRaw = rawCache.get(code)
    if (cachedAdj && cachedAdj.day === today && cachedRaw && cachedRaw.day === today) {
      adjusted[code] = cachedAdj.points
      raw[code] = cachedRaw.points
    } else {
      missing.push(code)
    }
  }

  if (missing.length > 0) {
    const fetched = await Promise.all(
      missing.map(async (code) => {
        const [hfq, rawPoints] = await Promise.all([
          fetchQuantKline(code),
          invokeSafe<KlinePoint[]>('fetch_kline_series', { code, ktype: 'day', adjust: 'qfq', count: 6 }, []).then((points) => normalizeKlinePoints(points))
        ])
        return [code, hfq, rawPoints] as const
      })
    )
    for (const [code, hfq, rawPoints] of fetched) {
      if (hfq.length > 0) {
        klineCache.set(code, { day: today, points: hfq })
        adjusted[code] = hfq
      }
      if (rawPoints.length > 0) {
        rawCache.set(code, { day: today, points: rawPoints })
        raw[code] = rawPoints
      }
    }
  }
  return { adjusted, raw }
}
