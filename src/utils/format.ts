export function formatSigned(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

export function formatOptionalNumber(value: number | undefined | null, fractionDigits = 2): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--'
  }

  return value.toFixed(fractionDigits)
}

export function formatSignedOptionalPercent(value: number | undefined | null): string {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return '--'
  }

  return formatSignedPercent(value)
}

export function getSignedChangeTone(value: number | undefined | null): '' | 'up' | 'down' {
  if (value === undefined || value === null || !Number.isFinite(value)) {
    return ''
  }

  return value >= 0 ? 'up' : 'down'
}

export function formatOptionalDate(value: string | undefined | null): string {
  return value?.trim() || '--'
}

export function formatSignedPercent(value: number): string {
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export function formatCompactMoney(value: number, signed = false): string {
  if (!Number.isFinite(value)) return '--'

  const absoluteValue = Math.abs(value)
  const sign = signed ? (value > 0 ? '+' : value < 0 ? '-' : '') : ''
  if (absoluteValue >= 100_000_000) {
    return `${sign}¥${(absoluteValue / 100_000_000).toFixed(2)}亿`
  }
  if (absoluteValue >= 10_000) {
    return `${sign}¥${(absoluteValue / 10_000).toFixed(2)}万`
  }

  return `${sign}¥${absoluteValue.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`
}

export function formatVolume(value: number | undefined): string {
  if (!value) return '--'
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}<span class="stat-unit">亿手</span>`
  if (value >= 10000) return `${(value / 10000).toFixed(2)}<span class="stat-unit">万手</span>`
  return `${value.toFixed(0)}<span class="stat-unit">手</span>`
}

export function formatAmount(value: number | undefined): string {
  if (!value) return '--'
  if (value >= 100000000) return `${(value / 100000000).toFixed(2)}<span class="stat-unit">亿</span>`
  if (value >= 10000) return `${(value / 10000).toFixed(2)}<span class="stat-unit">万</span>`
  return value.toFixed(0)
}

export function formatMarketCap(value: number | undefined): string {
  if (!value) return '--'
  if (value >= 1) return `${value.toFixed(2)}<span class="stat-unit">亿</span>`
  if (value >= 0.01) return `${(value * 10000).toFixed(2)}<span class="stat-unit">万</span>`
  return value.toFixed(2)
}

export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return '--'
  return value.toFixed(2)
}

export function formatMA(value: number | undefined): string {
  if (value === undefined || Number.isNaN(value) || !Number.isFinite(value)) return '--'
  return value.toFixed(2)
}

export function formatOrderBookVolume(value: number | undefined): string {
  if (!value) return '--'
  if (value >= 10000) return `${(value / 10000).toFixed(2)}万`
  return value.toFixed(0)
}
