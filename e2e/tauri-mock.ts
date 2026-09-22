import type { Page } from '@playwright/test'

/**
 * 在浏览器里模拟 Tauri 运行时：提供 __TAURI_INTERNALS__.invoke。
 * persist_app_state 的内容写入真实 localStorage（key 隔离），
 * reload 后依然存在，从而可以模拟"退出程序再打开"。
 */
export const MOCK_PERSIST_KEY = '__e2e_persisted_state__'

export function tauriStock(code: string, name: string, price = 10.12) {
  return {
    code,
    name,
    price,
    change: 0.22,
    changePercent: 2.22,
    high: price * 1.02,
    low: price * 0.98,
    open: price,
    prevClose: price - 0.2,
    volume: 123456,
    amount: 7890.5,
    time: '2026-09-16 15:00:00',
    totalMarketCap: 3200,
    circulationMarketCap: 6500,
    turnoverRate: 1.23,
    volumeRatio: 0.88,
    orderBook: {
      bids: [{ price: price - 0.02, volume: 100 }],
      asks: [{ price: price + 0.02, volume: 200 }]
    }
  }
}

export const initScript = `
  const PERSIST_KEY = ${JSON.stringify(MOCK_PERSIST_KEY)};
  const state = {
    calls: [],
    dragCount: 0,
    stocks: []
  };
  state.stocks = ${JSON.stringify([tauriStock('600000', '浦发银行'), tauriStock('000001', '平安银行', 12), tauriStock('600030', '中信证券', 22.69)])};

  function stockByCode(code) {
    return state.stocks.filter(function (stock) { return stock.code === code; });
  }

  function lastPersisted() {
    try {
      return window.localStorage.getItem(PERSIST_KEY);
    } catch (error) {
      return null;
    }
  }

  window.__e2eState = state;

  window.__TAURI_INTERNALS__ = {
    metadata: {
      currentWindow: { label: 'main' },
      currentWebview: { windowLabel: 'main', label: 'main' },
      windows: [{ label: 'main' }],
      webviews: [{ windowLabel: 'main', label: 'main' }]
    },
    invoke: async function (cmd, args) {
      state.calls.push(cmd);
      switch (cmd) {
        case 'load_app_state':
          return lastPersisted();
        case 'persist_app_state':
          try {
            window.localStorage.setItem(PERSIST_KEY, args.state);
          } catch (error) {}
          return null;
        case 'start_drag':
          state.dragCount += 1;
          return null;
        case 'set_always_on_top':
        case 'close_window':
        case 'minimize_window':
        case 'minimize_to_tray':
          return null;
        case 'fetch_stocks':
          return (args.codes || []).flatMap(function (code) { return stockByCode(code); });
        case 'search_stock':
          return [{ code: '600000', name: '浦发银行', market: '上海' }];
        case 'search_funds': {
          const keyword = String(args.keyword || '');
          if (keyword.includes('白酒') || keyword === '161725') {
            return [{ code: '161725', name: '招商中证白酒指数(LOF)A', type: '指数型' }];
          }
          return [];
        }
        case 'fetch_funds': {
          const fundDb = [
            { code: '161725', name: '招商中证白酒指数(LOF)A', nav: 0.85, navDate: '2026-09-22', changePercent: 1.2, estimateNav: null, estimateChangePercent: null, estimateTime: '', sector: '白酒' }
          ];
          const wanted = (args.codes || []).map(String);
          return fundDb.filter((fund) => wanted.includes(fund.code));
        }
        case 'open_release_page':
          return null;
        case 'append_log':
          return null;
        case 'check_update':
          return {
            currentVersion: '9.9.9',
            latestVersion: '9.9.9',
            hasUpdate: false,
            releaseUrl: '',
            downloadUrl: null,
            notes: ''
          };
        case 'ocr_image':
          state.ocrCalls = (state.ocrCalls || 0) + 1;
          return [
            '中 600030 12,254.00 +6,553.80 +54.96% 22.69 540股',
            '浦发银行 600000 8,800.00 +120.00',
            '招商中证白酒指数(LOF)A 2,254.00 25.92% 11.08%'
          ];
        case 'fetch_minute_data':
          return [
            { time: '09:30', price: 10, volume: 100, averagePrice: 10 },
            { time: '09:31', price: 10.1, volume: 30, averagePrice: 10.05 }
          ];
        case 'fetch_kline_data':
        case 'fetch_indices':
          return [];
        case 'fetch_global_indices': {
          const nowText = new Date(Date.now() + 8 * 3600 * 1000)
            .toISOString()
            .slice(0, 19)
            .replace('T', ' ');
          const marketIndices = {
            cn: [
              { code: 'sh000001', name: '上证指数', price: 3342.66, change: 40.12, changePercent: 1.21, time: nowText },
              { code: 'sz399001', name: '深证成指', price: 10560.44, change: -80.1, changePercent: -0.75, time: nowText }
            ],
            hk: [
              { code: 'hkHSI', name: '恒生指数', price: 24890.3, change: 120.5, changePercent: 0.49, time: nowText }
            ],
            us: [
              { code: 'usDJI', name: '道琼斯', price: 51936.76, change: 368.2, changePercent: 0.71, time: nowText }
            ],
            world: [
              { code: 'N225', name: '日经225', price: 65018.95, change: 884.11, changePercent: 1.38, time: nowText },
              { code: 'KS11', name: '韩国KOSPI', price: 7117.18, change: 109.4, changePercent: 1.56, time: nowText }
            ],
            sectors: [
              { code: 'BK1127', name: 'AI芯片', price: 1944.81, change: 58.5, changePercent: 3.1, time: nowText, gainCount: 86, loseCount: 4 },
              { code: 'BK0476', name: '算力', price: 2210.5, change: 45.2, changePercent: 2.61, time: nowText, gainCount: 60, loseCount: 10 }
            ],
            'industry-sectors': [
              { code: 'BK0475', name: '银行', price: 2210.5, change: 22.1, changePercent: 1.01, time: nowText, gainCount: 38, loseCount: 4 },
              { code: 'BK1036', name: '半导体', price: 5310.2, change: 159.3, changePercent: 3.1, time: nowText, gainCount: 180, loseCount: 20 }
            ],
            'us-sectors': [
              { code: 'XLK', name: '科技', price: 194.85, change: 5.47, changePercent: 2.89, time: nowText },
              { code: 'XLE', name: '能源', price: 62.46, change: -1.47, changePercent: -2.3, time: nowText }
            ]
          };
          state.marketCalls = state.marketCalls || [];
          state.marketCalls.push(args.market);
          return marketIndices[args.market] || [];
        }
        case 'plugin:window|scale_factor':
          return 1;
        case 'plugin:window|outer_position':
          return { x: 100, y: 100 };
        case 'plugin:window|outer_size':
        case 'plugin:window|inner_size':
          return { width: 280, height: 480 };
        case 'plugin:window|current_monitor':
          return {
            position: { x: 0, y: 0 },
            size: { width: 1920, height: 1080 },
            workArea: { position: { x: 0, y: 0 }, size: { width: 1920, height: 1040 } },
            scaleFactor: 1,
            name: 'e2e'
          };
        default:
          if (cmd.indexOf('plugin:window|') === 0 || cmd.indexOf('plugin:monitor|') === 0) {
            return null;
          }
          throw new Error('unmocked command: ' + cmd);
      }
    }
  };
`

export async function installTauriMock(page: Page): Promise<void> {
  await page.addInitScript(initScript)
}

/** 等待 debounce(300ms) 后的持久化落盘，并返回解析后的应用状态。 */
export async function readPersistedAppState(page: Page): Promise<Record<string, unknown>> {
  await page.waitForFunction(
    (key) => Boolean(window.localStorage.getItem(key)),
    MOCK_PERSIST_KEY,
    { timeout: 5000 }
  )
  const raw = await page.evaluate(
    (key) => window.localStorage.getItem(key),
    MOCK_PERSIST_KEY
  )
  return JSON.parse(raw as string)
}

/**
 * 等到持久化内容满足条件（谓词在浏览器里执行，避免与 300ms 写盘 debounce 竞态）。
 */
export async function waitForPersistedState(
  page: Page,
  predicate: (state: Record<string, unknown>) => boolean
): Promise<Record<string, unknown>> {
  await page.waitForFunction(
    ({ key, predicateSource }) => {
      const raw = window.localStorage.getItem(key)
      if (!raw) {
        return false
      }
      try {
        const state = JSON.parse(raw) as Record<string, unknown>
        // eslint-disable-next-line no-new-func
        return Function('state', `return (${predicateSource})(state)`)(state)
      } catch {
        return false
      }
    },
    { key: MOCK_PERSIST_KEY, predicateSource: predicate.toString() },
    { timeout: 5000 }
  )
  return readPersistedAppState(page)
}

/** 模拟"退出程序再打开"：刷新页面，持久化文件（localStorage 里的模拟盘）保持不变。 */
export async function simulateAppRestart(page: Page): Promise<void> {
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.app-shell')
}
