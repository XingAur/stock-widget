/**
 * 持仓截图 OCR 文本解析：
 * - 股票截图（券商App）：名称 + 6 位代码 + 市值盈亏 → 直接提取代码
 * - 基金截图（支付宝/天天基金）：多数只有名称（如"招商中证白酒指数(LOF)A"）→ 提取名称，导入时反查代码
 */

export interface OcrStockCandidate {
  code: string
  name: string
}

export interface OcrFundCandidate {
  name: string
}

export interface OcrParseResult {
  stocks: OcrStockCandidate[]
  funds: OcrFundCandidate[]
}

/** 独立的 6 位数字（前后都不是数字，避免命中金额/时间戳长数字段） */
const STOCK_CODE_PATTERN = /(?<!\d)(\d{6})(?!\d)/g

/** 连续的"中文开头"文本段（基金/股票名称的主体） */
const NAME_SEGMENT_PATTERN = /[\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z（）()·]+/g

/** 基金名称特征词；股票名（中信证券/东方财富等）不含这些词 */
const FUND_KEYWORDS = [
  '混合', '指数', '联接', '债券', '精选', '成长', '价值', '灵活配置',
  '股票型', '回报', '趋势', '优势', '量化', 'LOF', 'ETF', 'FOF', 'QDII',
  '医药', '医疗', '科技', '消费', '白酒', '军工', '新能源', '半导体', '黄金', '养老'
]

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')')
}

function looksLikeFundName(segment: string): boolean {
  return FUND_KEYWORDS.some((keyword) => segment.includes(keyword))
}

export function parseOcrLines(lines: readonly string[]): OcrParseResult {
  const stockByCode = new Map<string, OcrStockCandidate>()
  const fundByName = new Map<string, OcrFundCandidate>()

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }

    const segments = (line.match(NAME_SEGMENT_PATTERN) ?? []).map(normalizeName)
    const codes = [...line.matchAll(STOCK_CODE_PATTERN)].map((match) => match[1])

    if (codes.length > 0) {
      // 股票持仓行：取 6 位代码，名称用该行里第一个文本段（通常在代码左侧）
      for (const code of codes) {
        if (!stockByCode.has(code)) {
          stockByCode.set(code, { code, name: segments[0] ?? '' })
        }
      }
      continue
    }

    for (const segment of segments) {
      if (looksLikeFundName(segment) && segment.length >= 4 && !fundByName.has(segment)) {
        fundByName.set(segment, { name: segment })
      }
    }
  }

  return {
    stocks: [...stockByCode.values()],
    funds: [...fundByName.values()]
  }
}
