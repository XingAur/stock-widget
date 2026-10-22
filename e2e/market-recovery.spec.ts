import { expect, test, type Page } from '@playwright/test'
import { initScript } from './tauri-mock'

async function setup(page: Page, fail: boolean) {
  await page.clock.install()
  await page.addInitScript(initScript + `
    window.__marketProbe = { fail: ${fail}, empty: false, calls: 0, logs: [] };
    const originalInvoke = window.__TAURI_INTERNALS__.invoke;
    window.__TAURI_INTERNALS__.invoke = async function(cmd, args) {
      const probe = window.__marketProbe;
      if (cmd === 'append_log') { probe.logs.push(args.message); return; }
      if (cmd === 'fetch_global_indices' && args.market === 'industry-sectors') {
        probe.calls++;
        if (probe.fail) throw '行情服务返回错误 https://push2.eastmoney.com：502 Bad Gateway';
        if (probe.empty) return [];
      }
      return originalInvoke.call(this, cmd, args);
    };
  `)
  await page.goto('/')
  await page.locator('.market-btn').click()
}

test('首次失败显示状态未知、记录真实错误，并自动重试恢复', async ({ page }) => {
  await setup(page, true)
  await expect(page.locator('.market-status')).toHaveText(/状态未知/)
  await expect(page.locator('.market-empty')).toContainText('东方财富服务暂时不可用')
  await expect.poll(() => page.evaluate(() => (window as any).__marketProbe.logs.join('\n'))).toContain('502 Bad Gateway')
  await page.evaluate(() => { (window as any).__marketProbe.fail = false })
  await page.clock.fastForward(15_100)
  await expect(page.locator('.market-card').first()).toBeVisible()
  await expect(page.locator('.market-error')).toHaveCount(0)
})

test('持续失败最多重试三次，手动刷新可重新恢复', async ({ page }) => {
  await setup(page, true)
  await expect(page.locator('.market-retry')).toContainText('15 秒')
  for (const [delay, text] of [[15_100, '30 秒'], [30_100, '60 秒'], [60_100, '自动重试已暂停']] as const) {
    await page.clock.fastForward(delay)
    await expect(page.locator('.market-retry')).toContainText(text)
  }
  await page.clock.fastForward(600_000)
  expect(await page.evaluate(() => (window as any).__marketProbe.calls)).toBe(4)
  await page.evaluate(() => { (window as any).__marketProbe.fail = false })
  await page.locator('.refresh-btn').click()
  await expect(page.locator('.market-card').first()).toBeVisible()
})

test('已有数据刷新为空时保留旧行情，切换视图后缓存也不丢失', async ({ page }) => {
  await setup(page, false)
  await expect(page.locator('.market-card').first()).toBeVisible()
  const count = await page.locator('.market-card').count()
  await page.evaluate(() => { (window as any).__marketProbe.empty = true })
  await page.locator('.refresh-btn').click()
  await expect(page.locator('.market-retry')).toContainText('上次成功获取的数据')
  await expect(page.locator('.market-card')).toHaveCount(count)
  await page.getByRole('button', { name: '指数', exact: true }).click()
  await expect(page.locator('.market-card', { hasText: '上证指数' })).toBeVisible()
  await page.getByRole('button', { name: '行业', exact: true }).click()
  await expect(page.locator('.market-retry')).toContainText('上次成功获取的数据')
  await expect(page.locator('.market-card')).toHaveCount(count)
})
