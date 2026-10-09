// @vitest-environment happy-dom
import { createApp } from 'vue'
import { describe, expect, it } from 'vitest'
import FundPerformanceChart from './FundPerformanceChart.vue'
import FundIncomeChart from './FundIncomeChart.vue'

describe('fund chart zero references', () => {
  it('renders a visible 0% reference even when the performance series is flat', () => {
    const host = document.createElement('div')
    const app = createApp(FundPerformanceChart, {
      model: { fund: [{ date: '2026-01-01', value: 0 }, { date: '2026-01-02', value: 0 }], benchmark: [], minValue: 0, maxValue: 0 },
      history: [], range: 'all'
    })
    try {
      app.mount(host)
      expect(host.querySelector('.zero-label')).toBeNull()
      const y = Number(host.querySelector('.zero-line')?.getAttribute('y1'))
      expect(y).toBeGreaterThan(28)
      expect(y).toBeLessThan(162)
    } finally { app.unmount() }
  })

  it('puts the ¥0 reference below an entirely profitable income curve using the same coordinates', () => {
    const host = document.createElement('div')
    const snapshots = [10, 20].map((totalProfit, index) => ({
      date: `2026-01-0${index + 1}`, officialNav: 1, shares: 100, remainingCost: 100,
      marketValue: 100 + totalProfit, realizedProfit: 0, totalProfit, dailyProfit: 10, hasAdjustment: false
    }))
    const app = createApp(FundIncomeChart, { snapshots, range: 'all', currentTotalProfit: 20 })
    try {
      app.mount(host)
      const y = Number(host.querySelector('.income-zero-line')?.getAttribute('y1'))
      expect(host.querySelector('.income-zero-label')).toBeNull()
      const curve = host.querySelector('.income-line')?.getAttribute('d') ?? ''
      const ys = [...curve.matchAll(/[ML] [\d.]+ ([\d.]+)/g)].map((match) => Number(match[1]))
      expect(ys).toHaveLength(2)
      expect(ys.every((value) => value < y)).toBe(true)
      expect(y).toBeLessThan(120)
    } finally { app.unmount() }
  })
})
