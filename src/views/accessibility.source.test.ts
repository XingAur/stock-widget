import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const settings = readFileSync(new URL('./Settings.vue', import.meta.url), 'utf8')
const app = readFileSync(new URL('../App.vue', import.meta.url), 'utf8')
const home = readFileSync(new URL('./Home.vue', import.meta.url), 'utf8')
const fundDetail = readFileSync(new URL('./FundDetail.vue', import.meta.url), 'utf8')
const fundPositionDialog = readFileSync(new URL('../components/fund/FundPositionDialog.vue', import.meta.url), 'utf8')
const fundTransactionList = readFileSync(new URL('../components/fund/FundTransactionList.vue', import.meta.url), 'utf8')

describe('settings accessibility source', () => {
  it('names icon and form controls and exposes selected theme state', () => {
    expect(settings).toContain('aria-label="关闭设置"')
    expect(settings).toContain('aria-label="窗口置顶"')
    expect(settings).toContain('aria-label="开机自启"')
    expect(settings).toContain('aria-label="最小化到托盘"')
    expect(settings).toContain(':aria-pressed="settings.settings.theme === \'light\'"')
    expect(settings).toContain('aria-label="字体样式"')
    expect(settings).toContain('aria-label="背景透明度"')
  })
})

describe('position dialog accessibility source', () => {
  it('marks all overlays as modal dialogs', () => {
    expect(app).toContain('aria-label="应用设置"')
    expect(app).toContain('aria-modal="true"')
    expect(home).toContain('aria-modal="true"')
    expect(fundPositionDialog).toContain('aria-modal="true"')
    expect(fundTransactionList).toContain('aria-modal="true"')
  })

  it('supports Escape and keyboard focus containment', () => {
    expect(app).toContain('trapModalFocus')
    expect(home).toContain('trapModalFocus')
    expect(fundDetail).toContain('trapModalFocus')
    expect(fundDetail).toContain("event.key === 'Escape'")
  })
})

describe('fund detail action source', () => {
  it('uses icon components instead of text-symbol icons', () => {
    expect(fundDetail).toContain("from 'lucide-vue-next'")
    expect(fundDetail).not.toContain("icon: '＋'")
    expect(fundDetail).not.toContain("icon: '•••'")
  })
})
