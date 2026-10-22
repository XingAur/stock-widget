import { expect, test, type Page } from '@playwright/test'
import {
  installTauriMock,
  simulateAppRestart,
  waitForPersistedState,
  tauriStock
} from './tauri-mock'

test.beforeEach(async ({ page }) => {
  await installTauriMock(page)
  await page.goto('/')
  await page.waitForSelector('.app-shell')
})

test.describe('列表密度与排序控件', () => {
  test.use({ viewport: { width: 280, height: 544 }, deviceScaleFactor: 1.25 })

  const stockSamples = [
    ['002558', '巨人网络', 22.82, 4.01], ['002074', '国轩高科', 30.41, -2.84],
    ['603773', '沃格光电', 76.8, -4.83], ['000823', '超声电子', 21.33, -6.08],
    ['600206', '有研新材', 47.95, 7.41], ['001296', '长江材料', 19.28, -0.05],
    ['001258', '立新能源', 10.08, -0.3], ['605058', '澳弘电子', 53.35, 10],
    ['603538', '美诺华', 28.45, -3.43]
  ].map(([code, name, price, change]) => ({
    ...tauriStock(String(code), String(name), Number(price)), changePercent: Number(change),
    prevClose: Number(price) / (1 + Number(change) / 100)
  }))
  const fundSamples = [
    ['023651', '富国上证科创板芯片ETF发起式联接C', -0.0002, 1.8195],
    ['013315', '嘉实中证科创创业50ETF联接C', -0.0001, 1.0536],
    ['009995', '嘉实创新先锋混合C', -1.4, 1.9873],
    ['028375', '泰信资源精选混合发起式C', -0.22, 0.8989],
    ['019633', '国泰半导体设备ETF发起联接C', -2.78, 2.5319],
    ['021510', '宏利半导体产业混合C', -0.28, 2.2706],
    ['008887', '华夏国证半导体芯片ETF联接C', -0.02, 1.758]
  ].map(([code, name, changePercent, nav]) => ({
    code: String(code), name: String(name), changePercent: Number(changePercent), nav: Number(nav),
    navDate: '2026-09-22', estimateNav: null, estimateChangePercent: null, estimateTime: ''
  }))

  async function seedList(page: Page, theme: 'light' | 'dark', asset: 'stock' | 'fund') {
    await page.evaluate(({ stocks, funds, theme, asset }) => {
      localStorage.setItem('__e2e_stock_quotes__', JSON.stringify(stocks))
      localStorage.setItem('__e2e_fund_quotes__', JSON.stringify(funds))
      localStorage.setItem('__e2e_persisted_state__', JSON.stringify({
        schemaVersion: 1, activeAssetType: asset,
        watchList: stocks.map((item) => item.code), fundWatchList: funds.map((item) => item.code),
        settings: { theme, backgroundOpacity: 1, fontFamily: '"Microsoft YaHei", "PingFang SC", sans-serif' }
      }))
    }, { stocks: stockSamples, funds: fundSamples, theme, asset })
    await simulateAppRestart(page)
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
    await expect(page.locator('html')).toHaveCSS('opacity', '1')
  }

  test('股票线条变细，悬停手柄不挤动名称和折线', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await seedList(page, theme, 'stock')
      const first = page.locator('.stock-card').first()
      await expect(page.locator('.stock-card')).toHaveCount(stockSamples.length)
      await expect(first.locator('.sparkline-line')).toHaveCSS('stroke-width', '1.1px')
      await page.mouse.move(200, 20)
      await expect(first.locator('.drag-handle')).toHaveCSS('opacity', '0')
      const beforeName = await first.locator('.stock-name').boundingBox()
      const beforeChart = await first.locator('.watchlist-sparkline').boundingBox()
      await first.hover()
      await expect(first.locator('.drag-handle')).toHaveCSS('opacity', '1')
      expect(await first.locator('.stock-name').boundingBox()).toEqual(beforeName)
      expect(await first.locator('.watchlist-sparkline').boundingBox()).toEqual(beforeChart)
      await page.mouse.move(200, 20)
      await expect(first.locator('.drag-handle')).toHaveCSS('opacity', '0')
      await page.screenshot({ path: `.cache/watchlist-review/stock-${theme}.png`, animations: 'disabled' })
    }
  })

  test('基金字号和行高收紧，零涨幅显示中性且悬停不发生位移', async ({ page }) => {
    for (const theme of ['light', 'dark'] as const) {
      await seedList(page, theme, 'fund')
      const first = page.locator('.fund-card').first()
      await expect(page.locator('.fund-card')).toHaveCount(fundSamples.length)
      await expect(first.locator('.fund-change-value')).toHaveText('0.00%')
      await expect(first.locator('.fund-change-value')).not.toHaveClass(/up|down/)
      await expect(first.locator('.fund-change-value')).toHaveCSS('font-size', '13px')
      await expect(first.locator('.fund-change-value')).toHaveCSS('font-weight', '650')
      await expect(first.locator('.fund-title')).toHaveAttribute('title', fundSamples[0].name)
      await expect(first.locator('.sparkline-zero-line')).toHaveCount(1)
      const before = await first.locator('.fund-title').boundingBox()
      await first.hover()
      await expect(first.locator('.drag-handle')).toHaveCSS('opacity', '1')
      expect(await first.locator('.fund-title').boundingBox()).toEqual(before)
      await page.mouse.move(200, 20)
      await expect(first.locator('.drag-handle')).toHaveCSS('opacity', '0')
      await page.screenshot({ path: `.cache/watchlist-review/fund-${theme}.png`, animations: 'disabled' })
    }
  })

  test('浮动手柄可以排序且不会打开详情或拖动窗口', async ({ page }) => {
    await seedList(page, 'light', 'stock')
    const first = page.locator('.stock-card').first()
    const second = page.locator('.stock-card').nth(1)
    await first.hover()
    const handle = first.locator('.drag-handle')
    await expect(handle).toHaveCSS('opacity', '1')
    await handle.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('.detail-panel')).toHaveCount(0)
    const from = await handle.boundingBox()
    const to = await second.boundingBox()
    if (!from || !to) throw new Error('排序控件未渲染')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 8 })
    await page.mouse.up()
    const saved = await waitForPersistedState(page, (state) => (state.watchList as string[])[0] === '002074')
    expect((saved.watchList as string[]).slice(0, 2)).toEqual(['002074', '002558'])
    await expect(page.locator('.detail-panel')).toHaveCount(0)
    expect(await readDragCount(page)).toBe(0)
  })
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

test.describe('右键菜单', () => {
  test('靠窗口右下角打开时，菜单按实际尺寸收进窗口', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')
    const card = page.locator('.stock-card', { hasText: '浦发银行' })
    const box = await card.boundingBox()
    if (!box) throw new Error('card not rendered')
    await card.click({ button: 'right', position: { x: box.width - 4, y: box.height / 2 } })

    const menu = page.locator('.context-menu')
    await expect(menu).toBeVisible()
    const viewport = page.viewportSize()!
    const rect = await menu.boundingBox()
    expect(rect).not.toBeNull()
    expect(rect!.x).toBeGreaterThanOrEqual(0)
    expect(rect!.x + rect!.width).toBeLessThanOrEqual(viewport.width)
    expect(rect!.y + rect!.height).toBeLessThanOrEqual(viewport.height)
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
  test('自定义宽度在页面切换和详情往返后保持不变', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')
    await page.setViewportSize({ width: 980, height: 650 })
    for (const scale of [1, 1.25, 1.5]) {
      const original = { x: Math.round(1920 - 320 * scale - 20), y: 80, width: Math.round(320 * scale), height: Math.round(520 * scale), scale }
      await page.evaluate(bounds => { (window as any).__e2eState.windowBounds = bounds }, original)
      const sizeCalls = await countCommand(page, 'plugin:window|set_size')
      await page.locator('.app-title').click()
      await expect(page.locator('.app-title')).toHaveText('A+Fund Assistant')
      await page.locator('.market-btn').click()
      await expect(page.locator('.market-view')).toBeVisible()
      await page.locator('.market-globe-btn').click()
      await page.locator('.app-title').click()
      await expect(page.locator('.stock-list')).toBeVisible()
      await page.locator('.traffic-settings').click()
      await expect(page.locator('.settings-dialog')).toBeVisible()
      await page.keyboard.press('Escape')
      await expect(page.locator('.settings-dialog')).toHaveCount(0)
      expect(await countCommand(page, 'plugin:window|set_size')).toBe(sizeCalls)
      expect(await page.evaluate(() => (window as any).__e2eState.windowBounds)).toEqual(original)

      const card = page.locator('.stock-card', { hasText: '浦发银行' })
      await card.click()
      await expect(page.locator('.detail-panel')).toBeVisible()
      await expect.poll(() => page.evaluate(() => (window as any).__e2eState.windowBounds.width)).toBe(Math.round((320 + 620) * scale))
      await expect(page.locator('.sidebar')).toHaveCSS('flex-basis', '320px')
      await card.click()
      await expect(page.locator('.detail-panel')).toHaveCount(0)
      await expect.poll(() => page.evaluate(() => (window as any).__e2eState.windowBounds)).toEqual(original)
      // 展开状态直接切页也必须恢复原宽度及锚点。
      await card.click()
      await expect.poll(() => page.evaluate(() => (window as any).__e2eState.windowBounds.width)).toBe(Math.round((320 + 620) * scale))
      await page.locator('.app-title').click()
      await expect(page.locator('.app-title')).toHaveText('A+Fund Assistant')
      await expect.poll(() => page.evaluate(() => (window as any).__e2eState.windowBounds)).toEqual(original)
      await page.locator('.app-title').click()
    }
  })

  test('透明窗口四角只保留一层圆角，无投影描边及顶部高光叠层', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 520 })
    await expect(page.locator('#app')).toHaveCSS('box-shadow', 'none')
    expect(await page.locator('#app').evaluate(el => getComputedStyle(el, '::before').display)).toBe('none')
    await expect(page.locator('#app')).toHaveCSS('clip-path', 'inset(0px round 22px)')
    await page.screenshot({ path: 'test-results/window-corners-transparent.png', omitBackground: true })
  })

  test('屏幕右侧向左打开详情后，关闭恢复小组件原位置并显示昨收零线', async ({ page }) => {
    await addStockThroughSearch(page, '600000', '浦发银行')
    await page.setViewportSize({ width: 900, height: 700 })
    const card = page.locator('.stock-card', { hasText: '浦发银行' })
    await expect(card.locator('.sparkline-zero-line')).toHaveCount(1)
    await expect(card.locator('.sparkline-zero-label')).toHaveCount(0)
    const original = await page.evaluate(() => ({ ...(window as any).__e2eState.windowBounds }))
    await card.click()
    await expect(page.locator('.detail-panel')).toBeVisible()
    await expect(page.locator('.workspace')).toHaveClass(/detail-left/)
    await expect(page.locator('.minute-chart-svg')).toBeVisible()
    await expect(page.locator('.chart-zero-line')).toHaveCount(1)
    await expect(page.locator('.chart-zero-line')).toHaveCSS('stroke-width', '1.2px')
    await expect(page.locator('.chart-zero-label')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/stock-detail-zero-reference.png' })
    await expect.poll(() => page.evaluate(() => (window as any).__e2eState.windowBounds.x)).toBe(original.x - 620 * original.scale)
    await card.click()
    await expect(page.locator('.detail-panel')).toHaveCount(0)
    await expect.poll(() => page.evaluate(() => (window as any).__e2eState.windowBounds)).toEqual(original)
  })

  test('基金列表和业绩详情只显示基准虚线', async ({ page }) => {
    await page.evaluate(() => localStorage.setItem('__e2e_persisted_state__', JSON.stringify({
      schemaVersion: 1,
      activeAssetType: 'fund',
      fundWatchList: ['161725']
    })))
    await simulateAppRestart(page)
    const card = page.locator('.fund-card')
    await expect(card.locator('.sparkline-zero-line')).toHaveCount(1)
    await expect(card.locator('.sparkline-zero-label')).toHaveCount(0)
    await page.setViewportSize({ width: 900, height: 600 })
    await card.click()
    await page.locator('.fund-tabs button', { hasText: '业绩走势' }).click()
    await expect(page.locator('.fund-chart-card svg')).toBeVisible()
    await expect(page.locator('.fund-chart-card .zero-line')).toHaveCount(1)
    await expect(page.locator('.fund-chart-card .zero-line')).toHaveCSS('stroke-width', '1.2px')
    await expect(page.locator('.fund-chart-card .zero-label')).toHaveCount(0)
    await page.screenshot({ path: 'test-results/fund-performance-zero-reference.png' })
  })

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

    // 涨幅数字要真正显示为“涨”色，不能被磁贴的默认文字色盖掉
    await expect(bank.locator('.market-card-percent')).toHaveCSS('color', await trendColor(page, 'rise'))
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
    await expect(page.locator('.market-card', { hasText: '深证成指' }).locator('.market-card-percent')).toHaveCSS('color', await trendColor(page, 'fall'))

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

/** 读取当前主题下 --rise / --fall 解析出的实际颜色，用于断言文字确实显示为涨跌色 */
async function trendColor(page: Page, tone: 'rise' | 'fall'): Promise<string> {
  return page.evaluate((name) => {
    const probe = document.createElement('span')
    probe.style.color = `var(--${name})`
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  }, tone)
}

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

test('旧版研究页恢复到股票自选并保留持仓，A+回归整段标题且加号为红色', async ({ page }) => {
  await page.evaluate(() => {
    window.localStorage.setItem('__e2e_persisted_state__', JSON.stringify({
      schemaVersion: 2,
      activeAssetType: 'quant',
      quantTopN: 5,
      importedQuantReport: { nav: [1, 1.1] },
      watchList: ['600000'],
      stockPositions: { '600000': { costPrice: 8, shares: 100 } }
    }))
  })
  await simulateAppRestart(page)
  await expect(page.locator('.stock-list')).toBeVisible()
  await expect(page.locator('.stock-card').filter({ hasText: '浦发银行' })).toBeVisible()
  await expect(page.locator('.brand-badge, .cl-brand')).toHaveCount(0)
  await expect(page.locator('.app-title')).toHaveText('A+Stock Assistant')
  await expect(page.locator('.app-title .brand-prefix')).toHaveText('A+')
  const red = await page.evaluate(() => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--c-red)'
    document.body.appendChild(probe)
    const color = getComputedStyle(probe).color
    probe.remove()
    return color
  })
  await expect(page.locator('.brand-plus')).toHaveCSS('color', red)
  const saved = await waitForPersistedState(page, (state) => state.activeAssetType === 'stock')
  expect(saved.stockPositions).toEqual({ '600000': { costPrice: 8, shares: 100 } })
  expect(saved).not.toHaveProperty('quantTopN')
  expect(saved).not.toHaveProperty('importedQuantReport')
  await page.locator('.app-title').click()
  await expect(page.locator('.app-title')).toHaveText('A+Fund Assistant')
  await expect(page.locator('.brand-plus')).toHaveCSS('color', red)
})
