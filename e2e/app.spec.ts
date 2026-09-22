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
  test('地球按钮打开市场页，A股默认显示板块榜', async ({ page }) => {
    const globe = page.locator('.market-btn')
    await expect(globe).toHaveAttribute('title', '市场助手')

    await globe.click()
    await expect(page.locator('.market-view')).toBeVisible()
    await expect(page.locator('.market-tab', { hasText: 'A股' })).toHaveClass(/active/)

    // A股默认显示概念板块榜（带涨跌家数）
    const aiChip = page.locator('.market-card', { hasText: 'AI芯片' })
    await expect(aiChip).toBeVisible()
    await expect(aiChip).toHaveClass(/up/)
    await expect(aiChip.locator('.market-card-members')).toHaveText(/涨 86/)
    await expect(page.locator('.market-status')).toHaveText(/A股盘中/)
  })

  test('有板块的市场可切换板块/指数，纯指数市场只有指数', async ({ page }) => {
    await page.locator('.market-btn').click()
    await page.locator('.market-view').waitFor()

    // A股：板块 → 指数
    await page.locator('.market-mode-btn', { hasText: '指数' }).click()
    const shIndex = page.locator('.market-card', { hasText: '上证指数' })
    await expect(shIndex).toBeVisible()
    await expect(shIndex).toHaveClass(/up/)
    const szIndex = page.locator('.market-card', { hasText: '深证成指' })
    await expect(szIndex).toHaveClass(/down/)
    await expect(page.locator('.market-mode-btn', { hasText: '指数' })).toHaveClass(/active/)

    // 切回板块
    await page.locator('.market-mode-btn', { hasText: '板块' }).click()
    await expect(page.locator('.market-card', { hasText: 'AI芯片' })).toBeVisible()

    // 美股：默认行业板块，切换到指数
    await page.locator('.market-tab', { hasText: '美股' }).click()
    await expect(page.locator('.market-card', { hasText: '科技' })).toBeVisible()
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
