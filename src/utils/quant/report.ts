/** 研究报告导入（阶段F-40）：读取 a-share-quant 导出的版本化 JSON。 */

export interface ImportedReport {
  reportVersion: number
  strategyId: string
  metrics: Record<string, number | null>
  evidenceStatus: string
  nav: { date: string; value: number }[]
  interval: { start: string; end: string } | null
  dataHash?: string
  sourcePoolSize?: number
}

const MAX_NAV_POINTS = 5_000
const MAX_FILLS = 20_000

export function parseReport(payload: unknown): ImportedReport | null {
  if (!payload || typeof payload !== 'object') {
    return null
  }
  const raw = payload as Record<string, unknown>
  if (Number(raw.report_version) !== 1) {
    return null
  }
  const nav = Array.isArray(raw.nav) ? raw.nav.slice(0, MAX_NAV_POINTS) : []
  const fills = Array.isArray(raw.fills) ? raw.fills.slice(0, MAX_FILLS) : []
  if (fills.length > MAX_FILLS) {
    return null
  }
  return {
    reportVersion: 1,
    strategyId: String(raw.strategy_id ?? ''),
    metrics: (raw.metrics ?? {}) as Record<string, number | null>,
    evidenceStatus: String(raw.evidence_status ?? 'exploratory'),
    nav: nav.map((point) => ({
      date: String((point as Record<string, unknown>).date ?? ''),
      value: Number((point as Record<string, unknown>).value ?? 0)
    })),
    interval: (raw.interval ?? null) as { start: string; end: string } | null,
    dataHash: raw.data_hash !== undefined ? String(raw.data_hash) : undefined,
    sourcePoolSize: Number.isInteger(raw.source_pool_size) && (raw.source_pool_size as number) > 0
      ? raw.source_pool_size as number
      : undefined
  }
}

export function formatReportMetrics(report: ImportedReport): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = []
  const total = report.metrics.total_return
  if (typeof total === 'number') {
    rows.push({ label: '总收益', value: `${(total * 100).toFixed(1)}%` })
  }
  const ann = report.metrics.annualized_return
  rows.push({ label: '年化', value: typeof ann === 'number' ? `${(ann * 100).toFixed(1)}%` : '短样本' })
  const dd = report.metrics.max_drawdown
  if (typeof dd === 'number') {
    rows.push({ label: '最大回撤', value: `${(dd * 100).toFixed(1)}%` })
  }
  return rows
}
