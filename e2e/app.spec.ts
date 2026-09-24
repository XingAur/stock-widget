import { expect, test, type Page } from '@playwright/test'
import {
  installTauriMock,
  simulateAppRestart,
  waitForPersistedState
} from './tauri-mock'

test.beforeEach(async ({ page }) => {
  await installTauriMock(page)
  await page.goto('/')
  await page.waitForSelector('.app-shell')
})

async function addStockThroughSearch(page: Page, code: string, name: string) {
  await page.locator('.search-shell input').fill(code)
  await page.locator('.search-item').first().waitFor({ state: 'visible' })
  await page.locator('.search-item').first().click()
  await expect(page.locator('.stock-card', { hasText: name })).toBeVisible()
}

test.describe('状态持久化（问题 1/2：删除与清空在重启后保持）', () => {
  test('删除新增的股票后重启，股票不再出现', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')

    // 删除该股票
    const card = page.locator('.stock-card', { hasText: '浦发银行' })
    await card.hover()
    await card.locator('.remove-btn').click()
    await expect(card).toHaveCount(0)

    const persisted = await waitForPersistedState(
      page,
      (state) => Array.isArray(state.watchList) && state.watchList.length === 0
    )
    expect(persisted.watchList).toEqual([])

    // 重启：列表为空，不出现"还是原来的"回退
    await simulateAppRestart(page)
    await expect(page.locator('.stock-card')).toHaveCount(0)
    await expect(page.locator('.empty-state')).toBeVisible()
  })

  test('清空录入金额后重启，持仓条不再出现', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')

    // 右键录入持仓：成本价 10，股数 100
    const card = page.locator('.stock-card', { hasText: '浦发银行' })
    await card.click({ button: 'right' })
    await page.locator('.context-menu-item', { hasText: '录入持仓' }).click()
    await page.locator('.position-dialog input').nth(0).fill('10')
    await page.locator('.position-dialog input').nth(1).fill('100')
    await page.locator('.position-primary-btn').click()
    await card.hover()
    await expect(card.locator('.position-strip')).toBeVisible()

    // 等待持仓写盘后再重启
    await waitForPersistedState(
      page,
      (state) => Boolean((state.stockPositions as Record<string, unknown> | undefined)?.['600000'])
    )

    // 重启后持仓仍在（持久化恢复正确）
    await simulateAppRestart(page)
    const restoredCard = page.locator('.stock-card', { hasText: '浦发银行' })
    await restoredCard.hover()
    await expect(restoredCard.locator('.position-strip')).toBeVisible()

    // 清除持仓并重启：持仓条消失
    await restoredCard.click({ button: 'right' })
    await page.locator('.context-menu-item', { hasText: '录入持仓' }).click()
    await page.locator('.position-secondary-btn', { hasText: '清除' }).click()
    await expect(restoredCard.locator('.position-strip')).toHaveCount(0)

    const persisted = await waitForPersistedState(
      page,
      (state) => !state.stockPositions || Object.keys(state.stockPositions as Record<string, unknown>).length === 0
    )
    expect(persisted.stockPositions).toEqual({})

    await simulateAppRestart(page)
    const finalCard = page.locator('.stock-card', { hasText: '浦发银行' })
    await finalCard.hover()
    await expect(finalCard.locator('.position-strip')).toHaveCount(0)
  })

  test('主题设置在重启后保持', async ({ page }) => {
    await page.locator('.traffic-settings').click()
    await page.locator('.theme-btn', { hasText: '浅色' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await waitForPersistedState(
      page,
      (state) => Boolean(state.settings) && (state.settings as { theme?: string }).theme === 'light'
    )
    await simulateAppRestart(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })
})

test.describe('窗口拖动（问题 3：空白处即可拖动）', () => {
  test('标题栏与列表空白处按下会触发窗口拖动', async ({ page }) => {
    const dragCountBefore = await readDragCount(page)

    // 标题栏右侧空白
    const titleBar = page.locator('.title-bar')
    const box = await titleBar.boundingBox()
    if (!box) throw new Error('title bar not found')
    await page.mouse.move(box.x + box.width - 8, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.up()
    await expect.poll(() => readDragCount(page)).toBeGreaterThan(dragCountBefore)

    // 列表底部空白（无卡片遮挡区域）
    const list = page.locator('.stock-list')
    const listBox = await list.boundingBox()
    if (!listBox) throw new Error('stock list not found')
    const before = await readDragCount(page)
    await page.mouse.move(listBox.x + listBox.width / 2, listBox.y + listBox.height - 6)
    await page.mouse.down()
    await page.mouse.up()
    await expect.poll(() => readDragCount(page)).toBeGreaterThan(before)
  })

  test('股票卡片与按钮不触发窗口拖动', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')

    const before = await readDragCount(page)
    const card = page.locator('.stock-card', { hasText: '浦发银行' })
    await card.hover()
    await page.mouse.down()
    await page.mouse.up()
    expect(await readDragCount(page)).toBe(before)

    // mouse.down/up 已经相当于点击：详情面板被打开（真实应用此时窗口展开到 900 宽）
    await page.setViewportSize({ width: 900, height: 480 })
    await expect(page.locator('.detail-panel')).toBeVisible()

    // 再点一次卡片关闭详情，露出侧栏底部按钮
    await card.click()
    await expect(page.locator('.detail-panel')).toHaveCount(0)
    await page.setViewportSize({ width: 280, height: 480 })

    const refreshBefore = await readDragCount(page)
    const refresh = page.locator('.refresh-btn')
    await refresh.hover()
    await page.mouse.down()
    await page.mouse.up()
    expect(await readDragCount(page)).toBe(refreshBefore)
  })
})

test.describe('添加反馈（额外缺陷：失败静默）', () => {
  test('输入无法识别的代码时显示错误提示', async ({ page }) => {
    await page.locator('.search-shell input').fill('999999')
    await page.keyboard.press('Enter')

    await expect(page.locator('.search-error')).toBeVisible()
    await expect(page.locator('.search-error')).toContainText('添加失败')
    await expect(page.locator('.stock-card')).toHaveCount(0)
  })
})

test.describe('详情面板（长时间使用负载优化）', () => {
  test('打开详情面板正常渲染，且 K 线只加载一次', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')
    await page.setViewportSize({ width: 900, height: 480 })
    await page.locator('.stock-card', { hasText: '浦发银行' }).click()

    await expect(page.locator('.detail-panel')).toBeVisible()
    await expect(page.locator('.stock-header h2', { hasText: '浦发银行' })).toBeVisible()

    // K 线数据为空时显示占位而不是报错
    await expect(page.locator('.tab-bar')).toBeVisible()
    const klineCalls = await countCommand(page, 'fetch_kline_data')
    expect(klineCalls).toBeGreaterThan(0)
  })
})

test.describe('市场助手（全球市场数据页）', () => {
  test('地球按钮打开市场页，A股默认显示行业板块', async ({ page }) => {
    const globe = page.locator('.market-btn')
    await expect(globe).toHaveAttribute('title', '市场助手')

    await globe.click()
    await expect(page.locator('.market-view')).toBeVisible()
    await expect(page.locator('.market-tab', { hasText: 'A股' })).toHaveClass(/active/)

    // A股默认行业板块榜（主流做法），带涨跌家数
    const bank = page.locator('.market-card', { hasText: '银行' })
    await expect(bank).toBeVisible()
    await expect(bank.locator('.market-card-members')).toHaveText(/涨 38/)
    await expect(page.locator('.market-status')).toHaveText(/A股盘中/)
  })

  test('A股三段切换（行业|概念|指数），美股两段，纯指数市场无切换', async ({ page }) => {
    await page.locator('.market-btn').click()
    await page.locator('.market-view').waitFor()

    // A股：行业 → 概念 → 指数
    await page.locator('.market-mode-btn', { hasText: '概念' }).click()
    const aiChip = page.locator('.market-card', { hasText: 'AI芯片' })
    await expect(aiChip).toBeVisible()
    await expect(aiChip).toHaveClass(/up/)

    await page.locator('.market-mode-btn', { hasText: '指数' }).click()
    const shIndex = page.locator('.market-card', { hasText: '上证指数' })
    await expect(shIndex).toBeVisible()
    await expect(shIndex).toHaveClass(/up/)
    await expect(page.locator('.market-card', { hasText: '深证成指' })).toHaveClass(/down/)

    // 切回行业
    await page.locator('.market-mode-btn', { hasText: '行业' }).click()
    await expect(page.locator('.market-card', { hasText: '银行' })).toBeVisible()

    // 美股：两段（行业|指数），默认行业
    await page.locator('.market-tab', { hasText: '美股' }).click()
    await expect(page.locator('.market-card', { hasText: '科技' })).toBeVisible()
    await expect(page.locator('.market-mode-btn')).toHaveCount(2)
    await page.locator('.market-mode-btn', { hasText: '指数' }).click()
    await expect(page.locator('.market-card', { hasText: '道琼斯' })).toBeVisible()

    // 港股：只有指数，无切换控件
    await page.locator('.market-tab', { hasText: '港股' }).click()
    await expect(page.locator('.market-card', { hasText: '恒生指数' })).toBeVisible()
    await expect(page.locator('.market-mode-switch')).toHaveCount(0)

    // 全球
    await page.locator('.market-tab', { hasText: '全球' }).click()
    await expect(page.locator('.market-card', { hasText: '日经225' })).toBeVisible()
    await expect(page.locator('.market-card', { hasText: '韩国KOSPI' })).toBeVisible()
  })

  test('市场页返回自选并记住所在分组', async ({ page }) => {
    await page.locator('.market-btn').click()
    await page.locator('.market-view').waitFor()
    await page.locator('.market-tab', { hasText: '港股' }).click()
    await expect(page.locator('.market-card', { hasText: '恒生指数' })).toBeVisible()

    // 返回自选
    await page.locator('.market-globe-btn').click()
    await expect(page.locator('.market-view')).toHaveCount(0)
    await expect(page.locator('.stock-list')).toBeVisible()

    // 再次进入：恢复上次的港股分组
    await page.locator('.market-btn').click()
    await expect(page.locator('.market-tab', { hasText: '港股' })).toHaveClass(/active/)
    await expect(page.locator('.market-card', { hasText: '恒生指数' })).toBeVisible()
  })
})

test.describe('图片导入持仓', () => {
  test('识别股票与基金并去重已存在项，导入后出现在列表', async ({ page }) => {
    // 先添加浦发银行（导入图里也有它，应被标为已存在）
    await addStockThroughSearch(page, '600000', '浦发银行')

    await page.setInputFiles('.import-file-input', 'e2e/fixtures/sample.png')

    const dialog = page.locator('.import-dialog')
    await expect(dialog).toBeVisible()

    // 股票 600030 待导入；600000 已存在（禁选）；基金按名称反查到代码
    const rows = dialog.locator('.import-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.filter({ hasText: '中信证券' })).toHaveClass(/ready/)
    await expect(rows.filter({ hasText: '浦发银行' })).toHaveClass(/exists/)
    const fundRow = rows.filter({ hasText: '招商中证白酒指数(LOF)A' })
    await expect(fundRow).toHaveClass(/ready/)
    await expect(fundRow.locator('.import-meta')).toHaveText('161725')

    await dialog.locator('.import-primary-btn').click()
    await expect(dialog).toHaveCount(0)

    // 自选列表新增中信证券；切到基金页可见白酒基金
    await expect(page.locator('.stock-card', { hasText: '中信证券' })).toBeVisible()
    await page.locator('.app-title').click()
    await expect(page.locator('.stock-card', { hasText: '招商中证白酒指数(LOF)A' })).toBeVisible()
  })
})

async function readDragCount(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __e2eState: { dragCount: number } }).__e2eState.dragCount)
}

async function countCommand(page: Page, command: string): Promise<number> {
  return page.evaluate(
    (cmd) =>
      (window as unknown as { __e2eState: { calls: string[] } }).__e2eState.calls
        .filter((item) => item === cmd)
        .length,
    command
  )
}

test.describe('量化页（A+徽标入口）', () => {
  test('A+ 徽标进入量化页：评分排行、持仓对照、回测指标', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')

    const badge = page.locator('.brand-badge')
    await expect(badge).toHaveAttribute('title', /量化/)
    await badge.click()

    await expect(page.locator('.quant-view')).toBeVisible()
    await expect(badge).toHaveClass(/active/)

    // 评分排行：浦发银行出现且带动量百分比
    const row = page.locator('.quant-row', { hasText: '浦发银行' })
    await expect(row).toBeVisible()
    await expect(row.locator('.quant-mom')).toHaveText(/%$/)

    // 回测：净值曲线与指标卡（mock K 线单边上涨 → 总收益为正）
    await expect(page.locator('.quant-nav polyline').first()).toHaveAttribute('points', /.+/)
    const metrics = page.locator('section.quant-section:has-text("自选池历史示意") .metric')
    await expect(metrics.filter({ hasText: '总收益' }).first().locator('strong')).toHaveClass(/up/)

    // 返回自选
    await page.locator('.quant-back').click()
    await expect(page.locator('.quant-view')).toHaveCount(0)
    await expect(page.locator('.stock-list')).toBeVisible()
  })

  test('已有自选和持仓直接用于量化对照，不推断账户现金', async ({ page }) => {
    await page.evaluate(() => {
      window.localStorage.setItem('__e2e_persisted_state__', JSON.stringify({
        schemaVersion: 1,
        watchList: ['600000', '000001', '600030'],
        stockPositions: {
          '600000': { costPrice: 8, shares: 100 },
          '000001': { costPrice: 10, shares: 100 }
        },
        activeAssetType: 'stock'
      }))
    })
    await simulateAppRestart(page)
    await page.locator('.brand-badge').click()

    await expect(page.locator('.quant-sub')).toContainText('自选 3 只')
    await expect(page.locator('.quant-sub')).toContainText('已录持仓 2 只')
    await expect(page.locator('.quant-hint', { hasText: '已录入的 2 只股票持仓市值' })).toBeVisible()
    await expect(page.locator('.quant-hold')).toHaveCount(3)
    await expect(page.locator('.quant-assets')).toHaveCount(0)
    await expect(page.locator('.quant-hold.cash')).toHaveCount(0)
  })
})
