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

/** 连续的"中文开头"文本段，中间可含数字与字母（如"嘉实中证科创创业50ETF"） */
const NAME_SEGMENT_PATTERN = /[\u4e00-\u9fa5][\u4e00-\u9fa5A-Za-z0-9（）()·]+/g

/**
 * Windows OCR 常把中文按字符间加空格输出（"宏 利 半 导 体 混 合 C"）。
 * 压缩「至少一侧是中文/字母/括号」的空格让名称连成一体；
 * "600030 12,254"这类数字之间的空格保留，避免代码与金额粘连成 8 位数字。
 */
const SPACE_AFTER_WORD = /(?<=[\u4e00-\u9fa5A-Za-z（）()·])[ \t]+/g
const SPACE_BEFORE_WORD = /[ \t]+(?=[\u4e00-\u9fa5A-Za-z（）()·])/g

function squeezeSpacing(line: string): string {
  return line.replace(SPACE_AFTER_WORD, '').replace(SPACE_BEFORE_WORD, '')
}

/**
 * 基金名称的"结构词"：出现即视为基金名。
 * 泛行业词（指数/黄金/半导体等）单独出现不触发，避免把"我的基金 全部 偏股 偏债 指数…"
 * 这类导航栏噪声误判成基金。
 */
const FUND_STRUCTURAL_KEYWORDS = [
  '混合', '联接', '债券', '精选', '灵活配置', '股票型',
  '回报', '趋势', '优势', '量化', '增强', 'LOF', 'ETF', 'FOF', 'QDII'
]

function normalizeName(value: string): string {
  return value.replace(/\s+/g, '').replace(/（/g, '(').replace(/）/g, ')')
}

function looksLikeFundName(segment: string): boolean {
  return FUND_STRUCTURAL_KEYWORDS.some((keyword) => segment.includes(keyword))
}

export function parseOcrLines(lines: readonly string[]): OcrParseResult {
  const stockByCode = new Map<string, OcrStockCandidate>()
  const fundByName = new Map<string, OcrFundCandidate>()

  for (const rawLine of lines) {
    const line = squeezeSpacing(rawLine.trim())
    if (!line) {
      continue
    }

    const segments = (line.match(NAME_SEGMENT_PATTERN) ?? []).map(normalizeName)
    const codes = [...line.matchAll(STOCK_CODE_PATTERN)].map((match) => match[1])

    if (codes.length > 0) {
      // 股票持仓行：取 6 位代码；名称去掉粘连的尾部数字（代码或最新价）
      for (const code of codes) {
        if (!stockByCode.has(code)) {
          const rawName = segments[0] ?? ''
          const name = rawName.replace(/\d+$/, '').trim()
          stockByCode.set(code, { code, name: name || rawName })
        }
      }
      continue
    }

    for (const segment of segments) {
      // 名称尾部可能粘连金额数字（"混合C90.77" → "混合C"）
      const name = segment.replace(/[0-9]+$/, '')
      if (looksLikeFundName(name) && name.length >= 4 && !fundByName.has(name)) {
        fundByName.set(name, { name })
      }
    }
  }

  return {
    stocks: [...stockByCode.values()],
    funds: [...fundByName.values()]
  }
}
