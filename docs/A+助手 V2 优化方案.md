# A+助手 V2 优化方案

> 历史方案（2026-10-21 更新）：A+助手已移除量化页面、因子评分、回测和研究报告导入。本文中的量化章节仅保留为历史设计记录，不再列入开发计划；当前功能与开发方式以仓库 README 为准。

> 项目：`XingAur/stock-widget`  
> 仓库：https://github.com/XingAur/stock-widget  
> 审查基线：`main` / `v1.2.6`  
> 基线 Commit：`ce3fde11907bbf126ea8360c5539f307b27d0dae`（2026-09-24）  
> 文档版本：V2.0  
> 日期：2026-09-24  
> 定位：Windows 桌面 A 股 / 基金行情、持仓、市场观察与轻量量化助手

---

## 1. 文档目标

本方案不是一次“UI 美化”，而是针对 A+助手当前代码和功能现状进行一轮完整 V2 工程升级，目标包括：

1. **修复高优先级安全问题**
   - 手工下载并直接执行 EXE 的更新链路。
   - WebView2 生产参数中过度关闭安全能力。
   - CSP 与 Tauri IPC 权限进一步收紧。

2. **降低常驻桌面应用的请求量和资源消耗**
   - 报价、分时、基金、市场板块使用不同刷新频率。
   - 休市时停止高频请求。
   - 分时数据并发限流与批量状态更新。

3. **提高行情可靠性**
   - 从“最后一次请求时间”升级为“行情源时间 + 数据新鲜度”。
   - 避免市场切换时旧请求覆盖新页面数据。
   - 增加缓存、降级、错误状态和数据质量标记。

4. **降低后续维护成本**
   - 拆分 97 KB 的 Rust `main.rs`。
   - 拆分 `Home.vue` / `Detail.vue` 等超大组件。
   - 建立 Provider、Command、Rules、Persistence 边界。
   - 增强 CI、E2E、Clippy、版本一致性检查。

5. **重新定义量化模块**
   - 当前量化从“当前评分 + 独立等权回测”升级为：
     - 正确的信号时序；
     - Walk-forward；
     - Top-N 历史策略回测；
     - 基准对比；
     - 因子有效性检验；
     - 风险与交易成本模型；
     - 数据偏差说明；
     - 研究端 / 桌面端职责分层。

---

# 2. 当前项目评价

当前项目已经明显超过普通桌面行情 Demo，已有较好的工程基础：

- Tauri 2 + Vue 3 + TypeScript + Pinia；
- Rust 后端统一访问腾讯、东方财富、新浪等数据源；
- HTTP Client 复用、超时、连接池和 keepalive；
- 股票行情批量请求；
- 基金持仓数据 6 小时缓存；
- 空行情返回时保留上一份有效数据；
- `app-state.json` 原子写入；
- 单实例；
- 托盘；
- 窗口位置/大小恢复；
- 多显示器可视区域修正；
- Windows 本地 OCR；
- Vitest；
- Playwright E2E + Tauri IPC Mock；
- Rust 单元测试；
- GitHub Actions CI / Release；
- 量化模块已经完成第一轮拆分：
  - `factors.ts`
  - `selector.ts`
  - `backtest.ts`
  - `holdings.ts`
  - `cache.ts`
  - `report.ts`

因此 **V2 不建议推倒重写**。

总体原则：

> **保留现有 UI 和数据模型主体，对安全、刷新调度、异步一致性、量化正确性和模块边界进行定向升级。**

---

# 3. V2 优先级总览

| 优先级 | 模块 | 问题 / 目标 |
|---|---|---|
| P0 | 更新 | 改为 Tauri 官方签名 Updater |
| P0 | 安全 | 删除任意路径 `run_installer(path)` 能力 |
| P0 | WebView | 移除生产环境 `msSmartScreenProtection` 禁用 |
| P0 | 量化 | 修复开盘成交却使用当日收盘判断涨跌停的未来信息 |
| P0 | 量化 | 区分“自选池等权基准”与“因子 Top-N 策略回测” |
| P1 | 行情 | 重构 30 秒一刀切的刷新机制 |
| P1 | 分时 | 降低每个自选股单独分时请求的放大效应 |
| P1 | 行情 | 增加每只标的数据新鲜度 |
| P1 | 市场页 | 防止旧异步请求覆盖新市场 |
| P1 | 量化 | 完成 Walk-forward 策略回测 |
| P1 | 量化 | 使用完整已收盘数据产生研究信号 |
| P1 | 量化 | 基准、超额收益、Sharpe、Calmar、换手率等 |
| P2 | Rust | 拆分 `main.rs` |
| P2 | Vue | 拆分 `Home.vue` / `Detail.vue` |
| P2 | 持久化 | Schema V2 + migration + revision |
| P2 | CI | E2E、Clippy、版本一致性、安全回归 |
| P2 | 量化 | IC / ICIR / 分组收益 / 参数敏感性 |
| P3 | 数据层 | Provider 自动降级、磁盘行情缓存 |
| P3 | 量化 | 动态历史股票池 / Point-in-Time 数据 |

---

# 4. V2 开发总原则

## 4.1 正确性优先于功能数量

以下模块一旦显示错误，比“不显示”危害更大：

- 盈亏；
- 基金收益；
- 量化评分；
- 回测收益；
- 市场开闭市状态；
- 更新安装。

因此使用：

```text
正确数据 > 更多数据
可解释 > 黑盒
明确未知 > 猜测填充
保留旧有效值 > 用 0 覆盖
```

---

## 4.2 桌面 App 与研究端分层

A+助手适合做：

- 实时行情；
- 当前因子快照；
- 自选池轻量计算；
- 持仓偏离；
- 研究报告查看；
- 轻量历史回测；
- 参数快速切换。

`a-share-quant` 研究端更适合做：

- 全 A 股历史股票池；
- 退市股票；
- Point-in-Time 成分；
- 大样本因子研究；
- 多参数组合；
- 大规模 Walk-forward；
- Monte Carlo / Bootstrap；
- 全量交易流水；
- 复杂风控。

不要把几千只股票 × 多年 K 线 × 多策略研究全部塞进 Vue WebView。

推荐架构：

```text
a-share-quant
    │
    │ 研究 / 大规模回测
    │
    ├── report-v2.json
    │
    ▼
A+助手
    │
    ├── 当前行情
    ├── 当前因子评分
    ├── 当前持仓偏离
    ├── 轻量验证
    └── 报告可视化
```

---

# 5. Phase 0：建立 V2 基线

开始修改前先锁定现状。

## 5.1 创建分支

```bash
git checkout main
git pull
git checkout -b v2/optimization
```

---

## 5.2 基线验证

前端：

```bash
npm ci
npm run test
npm run build
npm run test:e2e
```

Rust：

```bash
cd src-tauri
cargo fmt --check
cargo check
cargo test
```

保存结果。

---

## 5.3 新增 V2 回归测试清单

优先写测试，再改逻辑。

新增：

```text
src/utils/security.test.ts
src/utils/refreshPolicy.test.ts
src/utils/market.test.ts
src/utils/persistence-v2.test.ts

src/utils/quant/rules.test.ts
src/utils/quant/backtest-walkforward.test.ts
src/utils/quant/metrics.test.ts
src/utils/quant/validation.test.ts
```

---

# 6. P0：更新系统重构

## 6.1 当前问题

当前 Rust：

```text
check_update()
download_update(url)
run_installer(path)
```

逻辑：

```text
GitHub Release
    ↓
下载 EXE
    ↓
写入 %TEMP%
    ↓
Command::new(installer)
    ↓
直接执行
```

当前 `run_installer` 主要只验证：

```text
path 是一个存在的文件
```

没有建立：

```text
安装包签名
→ 公钥校验
→ 安装
```

而且 `run_installer(path)` 本质上给 WebView IPC 暴露了一个“执行本地程序路径”的能力。

---

## 6.2 V2 方案

使用 Tauri 2 官方：

```text
tauri-plugin-updater
@tauri-apps/plugin-updater
```

官方 Updater 使用签名验证，签名校验不可关闭。

目标链路：

```text
GitHub Release
    │
    ├── APlus_Assistant_x.x.x_x64-setup.exe
    ├── .sig
    └── latest.json
              │
              ▼
       Tauri Updater
              │
       Ed25519 验签
              │
          安装升级
```

---

## 6.3 安装 Updater

执行：

```bash
npm run tauri add updater
```

确认：

```text
package.json
Cargo.toml
capabilities
```

均生成/加入 updater 依赖和权限。

---

## 6.4 生成签名密钥

开发机执行一次：

```bash
npm run tauri signer generate -- -w ~/.tauri/aplus.key
```

产生：

```text
私钥
公钥
```

规则：

- **私钥绝不提交 GitHub**
- 公钥可以写入 `tauri.conf.json`
- 私钥放 GitHub Actions Secrets

建议 Secret：

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

---

## 6.5 `tauri.conf.json`

目标结构：

```json
{
  "bundle": {
    "createUpdaterArtifacts": true
  },
  "plugins": {
    "updater": {
      "pubkey": "<PUBLIC KEY>",
      "endpoints": [
        "https://github.com/XingAur/stock-widget/releases/latest/download/latest.json"
      ],
      "windows": {
        "installMode": "passive"
      }
    }
  }
}
```

实际字段以当前 Tauri CLI 生成结果为准。

---

## 6.6 前端更新逻辑

新建：

```text
src/services/updater.ts
```

职责：

```text
checkUpdate()
downloadUpdate()
installUpdate()
```

App.vue 不直接管理底层 IPC。

示意：

```ts
const update = await check()

if (update) {
  await update.downloadAndInstall(progress => {
    // 更新进度
  })
}
```

UI 保留当前：

```text
发现新版本
更新说明
下载进度
稍后更新
立即更新
```

---

## 6.7 删除旧 Rust 能力

删除：

```rust
download_update
run_installer
```

从：

```rust
tauri::generate_handler![]
```

中移除。

`check_update` 也可以逐步删除，全部交给 Updater。

如果需要保留手动打开 Release：

```text
open_release_page
```

只允许：

```text
https://github.com/XingAur/stock-widget/
```

白名单地址，而不是任意 HTTPS URL。

---

## 6.8 Release Workflow

修改：

```text
.github/workflows/release.yml
```

使构建步骤带：

```text
TAURI_SIGNING_PRIVATE_KEY
TAURI_SIGNING_PRIVATE_KEY_PASSWORD
```

最终 Release 必须包含：

```text
APlus_Assistant_x.x.x_x64-setup.exe
*.sig
latest.json
```

---

## 6.9 验收

必须测试：

### 正常升级

```text
1.2.6 → 1.2.7
```

可以：

- 检查；
- 下载；
- 验签；
- 安装；
- 启动新版。

### 篡改测试

人为修改安装包任意字节。

预期：

```text
签名验证失败
不得执行
```

### 错误签名

使用另一个私钥签名。

预期：

```text
拒绝安装
```

### 安全回归

测试代码中断言：

```text
Rust 中不存在 run_installer
Rust 中不存在 Command::new(installer)
```

---

# 7. P0：WebView / CSP 安全

## 7.1 移除 SmartScreen 禁用

当前：

```json
"--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion"
```

V2 先修改为：

```text
删除 msSmartScreenProtection
```

保留其他用于 WebView 恢复/后台渲染 workaround 的参数，单独做 A/B 验证。

Microsoft 对 WebView2 的建议是：

> 调试性质 Browser Flags 不应无评估地长期随生产应用发布。

因此 V2 后续逐个验证：

```text
CalculateNativeWinOcclusion
disable-backgrounding-occluded-windows
disable-renderer-backgrounding
```

能否删除。

---

## 7.2 CSP 收紧

当前：

```text
script-src 'self' 'unsafe-inline'
```

第一步尝试：

```text
script-src 'self'
```

然后验证：

```text
Vue
Tauri IPC
异步组件
图表
设置
Updater
```

都正常。

暂时可保留：

```text
style-src 'self' 'unsafe-inline'
```

因为动态样式可能依赖 inline style。

---

## 7.3 Tauri Capability 最小化

检查：

```text
src-tauri/capabilities/default.json
```

原则：

```text
用到什么 → 开什么
不用 → 不给
```

尤其检查：

- updater；
- window；
- autostart；
- store；
- shell / opener。

不要为了方便给：

```text
shell:all
fs:all
```

---

# 8. P1：行情刷新系统重构

## 8.1 当前问题

股票 Store 当前：

```text
每 30 秒 refreshAll()
```

`refreshAll()` 同时：

```text
refreshStocks()
fetchAllSparklines()
refreshFunds()
```

问题：

### 股票报价

腾讯批量请求。

这一部分合理。

### Sparkline

每只股票单独：

```text
fetchMinuteData(code)
```

20 只股票时：

```text
每 30 秒 20 个请求
```

理论上：

```text
40 请求 / 分钟
2400 请求 / 小时
```

而分时图没有必要和报价同频刷新。

---

# 9. 新建 RefreshScheduler

建议新增：

```text
src/services/refreshScheduler.ts
src/utils/refreshPolicy.ts
```

---

## 9.1 数据刷新等级

### Level A：实时报价

```text
股票价格
涨跌
盘口
指数
```

盘中：

```text
15 ~ 30 秒
```

午休：

```text
1 ~ 3 分钟
```

休市：

```text
停止自动刷新
或 5 ~ 10 分钟仅做健康检查
```

---

### Level B：分时 Sparkline

盘中：

```text
60 ~ 120 秒
```

休市：

```text
不刷新
```

加入：

```text
最大并发 4~6
```

---

### Level C：基金估算

基金当前 `fetch_funds` 同时承担：

```text
最新基金净值
基金静态持仓
持仓股票行情
估算
```

V2 建议进一步分层：

```text
基金基础净值
    ↓ 低频

基金持仓结构
    ↓ 6h / 日级缓存

持仓股票行情
    ↓ 30~60 秒批量刷新

基金估算
    ↓ 本地计算
```

避免每次刷新重新走整个基金数据链。

---

### Level D：市场板块

当前 60 秒合理。

继续：

```text
开市刷新
休市停止
```

但开闭市应由统一 Session Policy 提供。

---

# 10. TradingSession / MarketClock

新增：

```text
src/utils/tradingSession.ts
```

不要依赖用户电脑当前所在时区。

A 股使用：

```text
Asia/Shanghai
```

而不是：

```text
new Date() 的本地日期
```

原因：

用户可能：

- 使用海外系统时区；
- VPN；
- 修改 Windows 时区。

API：

```ts
getChinaTradingDate()
getAStockSessionState()
shouldRefreshQuote()
shouldRefreshSparkline()
```

Session 可区分：

```text
preopen
morning
lunch
afternoon
closed
weekend
```

节假日如果没有完整交易日历：

第一阶段继续结合：

```text
行情源 timestamp
```

判断。

后续可引入交易日历。

---

# 11. Sparkline 请求优化

## 11.1 限流

当前：

```ts
Promise.all(watchList.map(fetchSparkline))
```

改成 worker pool：

```text
concurrency = 4~6
```

模式：

```ts
let cursor = 0

async function worker() {
  while (cursor < codes.length) {
    const code = codes[cursor++]
    await fetchSparkline(code)
  }
}

await Promise.all(
  Array.from({ length: Math.min(6, codes.length) }, worker)
)
```

---

## 11.2 一次响应式赋值

不要：

```text
股票 A 返回 → Map clone
股票 B 返回 → Map clone
股票 C 返回 → Map clone
...
```

改为：

```text
请求全部结束
    ↓
const next = new Map(old)
    ↓
统一写入
    ↓
sparklines.value = next
```

减少 Vue 更新次数。

---

## 11.3 Sparkline 缓存

缓存：

```ts
{
  code,
  sourceTime,
  fetchedAt,
  prices
}
```

盘中 TTL：

```text
60 秒
```

休市：

```text
直到下一交易日
```

---

# 12. P1：每只股票的数据新鲜度

当前全局：

```text
stockLastUpdate = new Date()
```

只代表：

> 客户端刚刚完成了一次请求。

它不代表：

> 数据源真的更新到了现在。

Stock 已有：

```text
time
```

因此增加：

```ts
interface QuoteFreshness {
  sourceTime: number
  ageMs: number
  level: 'live' | 'delayed' | 'stale'
}
```

---

## 12.1 UI

卡片正常：

```text
14:36:02
```

延迟：

```text
延迟 93s
```

陈旧：

```text
数据陈旧
```

颜色只做弱提示，不要遮挡价格。

---

## 12.2 推荐阈值

阈值放配置：

```text
live: <= 60s
delayed: <= 180s
stale: > 180s
```

不要写死在组件中。

---

# 13. P1：市场页异步请求串数据

当前：

```ts
const data = await fetchGlobalIndices(currentDataKey.value)
indices.value = data
```

如果用户快速：

```text
A股
→ 美股
→ 港股
```

旧请求有可能最后才回来。

---

## 13.1 Request Sequence

新增：

```ts
let loadSeq = 0

async function load() {
  const seq = ++loadSeq
  const key = currentDataKey.value

  const data = await fetchGlobalIndices(key)

  if (seq !== loadSeq) return
  if (key !== currentDataKey.value) return

  indices.value = data
}
```

同样的模式应用到：

```text
Detail
FundDetail
搜索自动补全
量化 reload
```

---

# 14. P2：Rust `main.rs` 拆分

当前：

```text
src-tauri/src/main.rs ≈ 97 KB
```

职责过多。

建议目标：

```text
src-tauri/src/
│
├── main.rs
│
├── commands/
│   ├── mod.rs
│   ├── stock.rs
│   ├── fund.rs
│   ├── market.rs
│   ├── window.rs
│   ├── persistence.rs
│   └── log.rs
│
├── providers/
│   ├── mod.rs
│   ├── tencent.rs
│   ├── eastmoney.rs
│   └── sina.rs
│
├── models/
│   ├── mod.rs
│   ├── stock.rs
│   ├── fund.rs
│   └── market.rs
│
├── parsers/
│   ├── tencent.rs
│   └── eastmoney.rs
│
├── http.rs
├── ocr.rs
├── app_log.rs
├── window_state.rs
└── state.rs
```

---

## 14.1 拆分顺序

不要一次把 3000 行全部移动。

### Step 1

先抽：

```text
models
```

仅移动 struct。

验证：

```bash
cargo test
```

---

### Step 2

抽：

```text
providers/tencent.rs
```

包含：

```text
to_tencent_code
parse_tencent_lines
parse_stock_from_parts
fetch_stocks
minute
kline
```

---

### Step 3

抽：

```text
providers/eastmoney.rs
```

包含：

```text
全球指数
行业
概念
基金档案
基金持仓
```

---

### Step 4

抽：

```text
window_state.rs
```

---

### Step 5

Command 变薄：

```rust
#[tauri::command]
async fn fetch_stocks(...) {
    stock_service.fetch_stocks(...).await
}
```

---

# 15. P3：Provider 抽象

第一阶段不必强行 trait 化。

先形成：

```text
TencentProvider
EastMoneyProvider
SinaProvider
```

第二阶段再支持 fallback。

例如：

```text
股票行情
Tencent
   ↓失败
EastMoney
```

返回结构必须附带：

```ts
source: 'tencent' | 'eastmoney'
sourceTime
```

这样 UI 能知道：

```text
数据来自哪里
是否延迟
是否使用降级源
```

---

# 16. P2：Vue 大组件拆分

当前：

```text
Home.vue       ≈ 51 KB
Detail.vue     ≈ 59 KB
FundDetail.vue ≈ 31 KB
```

---

## 16.1 Home

目标：

```text
Home.vue
│
├── AccountSummary.vue
├── WatchlistSearch.vue
├── StockCard.vue
├── FundCard.vue
├── WatchlistContextMenu.vue
├── StockPositionDialog.vue
└── composables/
    ├── useWatchlistSearch.ts
    ├── useWatchlistDrag.ts
    └── useContextMenu.ts
```

---

## 16.2 Detail

```text
Detail.vue
│
├── StockHeader.vue
├── QuoteStats.vue
├── IntradayChart.vue
├── OrderBook.vue
├── KlineChart.vue
└── composables/
    └── useStockDetail.ts
```

---

## 16.3 原则

不要按“每 200 行拆文件”。

按职责拆：

```text
数据加载
状态
渲染
交互
计算
```

一个组件只管理一类职责。

---

# 17. P2：持久化 V2

当前：

```text
schemaVersion = 1
```

并且：

```text
updatePersistedSlice(key: PersistedStateKey | string)
```

允许任意字符串，导致类型约束不完整。

例如当前量化已经使用：

```text
quantTargetMode
```

但 `PersistedStateKey` 没有明确声明。

---

## 17.1 Schema V2

建议：

```ts
interface PersistedAppStateV2 {
  schemaVersion: 2
  revision: number
  updatedAt: string

  watchList: string[]
  fundWatchList: string[]
  ...

  quant: {
    topN: 3 | 5 | 10 | 'all'
    targetMode: 'equal' | 'score'
    importedReport?: unknown
  }

  settings: Settings
}
```

---

## 17.2 Migration

新增：

```text
src/utils/migrations/
  v1ToV2.ts
```

读取逻辑：

```text
schemaVersion == 2
    ↓
直接解析

schemaVersion == 1
    ↓
migrateV1ToV2()
    ↓
保存 V2
```

不能：

```text
版本不匹配 → 直接返回 null
```

否则未来升级容易丢配置。

---

## 17.3 防止最后 300ms 数据丢失

当前保存 Debounce：

```text
300ms
```

极端情况：

```text
用户改持仓
→ 100ms 内托盘退出
→ debounce 还未触发
```

建议：

### Shadow Copy

每次：

```ts
updatePersistedSlice()
```

立刻同步：

```text
localStorage
```

文件写入继续 Debounce。

同时在：

```text
file
shadow
```

都保存：

```text
revision
updatedAt
```

启动时选择：

```text
revision 更高的版本
```

而不是固定：

```text
文件存在 → 永远优先文件
```

---

# 18. P2：CI / 发布工程

当前 CI 已有：

```text
Vitest
Build
cargo fmt
cargo check
cargo test
```

继续增加：

---

## 18.1 Playwright

```yaml
- name: Install Playwright Chromium
  run: npx playwright install chromium

- name: E2E
  run: npm run test:e2e
```

---

## 18.2 Clippy

Rust toolchain：

```yaml
components: rustfmt, clippy
```

增加：

```bash
cargo clippy --all-targets --all-features -- -D warnings
```

---

## 18.3 版本一致性

新增：

```text
scripts/check-version.mjs
```

比较：

```text
package.json
src-tauri/Cargo.toml
src-tauri/tauri.conf.json
```

任何不一致：

```text
process.exit(1)
```

CI：

```bash
node scripts/check-version.mjs
```

---

## 18.4 Security Test

扩展：

```text
src/utils/security.test.ts
```

断言：

```text
tauri.conf 不包含 msSmartScreenProtection
Rust 不包含 run_installer
CSP script-src 不包含 unsafe-inline
Updater 配置存在
```

其中 CSP 的断言在验证新 CSP 稳定后再开启。

---

# 19. 依赖升级策略

当前前端依赖版本区间相对保守。

Tauri 2 在 2026 年已经进入较新的 2.x 版本。

不要直接：

```bash
npm update
cargo update
```

全部升级。

建议独立分支：

```text
v2/dependency-upgrade
```

顺序：

```text
Tauri Core / CLI / API
→ Tauri Plugins
→ Vue
→ Vite
→ UnoCSS
→ Playwright / Vitest
```

每一层：

```text
test
build
e2e
cargo test
真实 Windows 运行
```

都通过再继续。

---

# 20. 量化 V2：当前状态

当前量化逻辑：

```text
当前自选池
    │
    ├── MOM20
    ├── REV5
    └── VOL20
          │
          ▼
     横截面 z-score
          │
     0.7 MOM + 0.3 REV
          │
          ▼
         排名
          │
   Top3 / Top5 / Top10
          │
   等权 / 评分加权
```

这是一个合理的 **轻量因子快照原型**。

但：

```text
Factor Ranking
```

和：

```text
runEqualWeightBacktest(usable)
```

现在不是同一个策略。

---

# 21. 量化 P0：修复回测未来信息

当前：

```ts
const limitUp = isLimitUpDay(prev, point.close, code)
```

却在：

```text
当天 open
```

成交。

即：

```text
先知道当天 close
再决定当天 open 能否成交
```

这是未来信息。

---

## 21.1 正确模型

如果策略定义：

```text
D-1 收盘信号
D 日开盘执行
```

那么 D 日执行判断只能使用：

```text
D-1 已知信息
+
D 日开盘时已知信息
```

包括：

```text
prevClose
open
证券规则
是否停牌
```

不能使用：

```text
D close
D high
D low
```

决定开盘订单是否成交。

---

## 21.2 修改结构

新建：

```text
src/utils/quant/rules.ts
```

定义：

```ts
interface TradingRule {
  limitRatio: number | null
  lotSize: number
  priceTick: number
  tPlusOne: boolean
}
```

新增：

```ts
getTradingRule(meta, date)
getLimitPrices(prevClose, rule)
canBuyAtOpen(...)
canSellAtOpen(...)
```

---

## 21.3 注意 2026 规则变化

截至本方案日期，2026-07-06 起：

- 沪市主板风险警示股票涨跌幅限制调整为 10%；
- 深市主板风险警示股票同步进入新规则体系；
- 科创板一般为 20%；
- 创业板一般为 20%；
- 北交所一般为 30%。

因此：

```text
看到 ST 就固定 5%
```

已经不是可靠实现。

而且还需要处理：

```text
IPO 无涨跌幅限制阶段
退市整理首日
停牌
特殊交易状态
规则生效日期
```

因此 V2 必须从：

```ts
limitRatioOf(code)
```

逐步升级为：

```ts
tradingRuleOf(securityMeta, tradeDate)
```

---

## 21.4 第一阶段最小修复

如果暂时没有完整证券元数据：

```text
主板 → 10%
创业板 → 20%
科创板 → 20%
北交所 → 30%
```

并且：

```text
只使用 open 与 prevClose 判定是否达到开盘涨跌停
```

同时明确注释：

> 这是简化成交模型，不处理 IPO / 退市整理 / 停牌等特殊交易日。

---

# 22. 量化 P0：重命名当前回测

当前：

```text
组合回测
```

实际上是：

```text
当前自选股票全集
每天等权再平衡
```

与上面的：

```text
MOM20 + REV5 → TopN
```

没有直接关系。

第一步先把 UI 改为：

```text
自选池等权基准
```

说明：

```text
当前自选股票固定池
历史等权基准
不代表上方因子策略的历史表现
```

这样在真正策略回测完成前，不会把两者混淆。

---

# 23. 量化 P1：真正的 Walk-forward 回测

目标策略：

```text
D-1 收盘
    │
    ├── 只使用 <= D-1 的历史数据
    │
    ├── MOM20
    ├── REV5
    ├── 因子标准化
    ├── Composite
    ├── 排名
    └── 选择 TopN
             │
             ▼
          D 开盘
             │
         执行调仓
             │
             ▼
          D 收盘
             │
          计算 NAV
```

---

## 23.1 新增 StrategyConfig

```ts
export interface StrategyConfig {
  topN: 3 | 5 | 10
  weightMode: 'equal' | 'score' | 'inverseVol'
  rebalance: 'daily' | 'weekly' | 'every5' | 'every20'
  maxSingleWeight: number
  turnoverThreshold: number
  commission: number
  minCommission: number
  stampTax: number
  slippage: number
}
```

---

## 23.2 新增历史因子快照

当前：

```ts
computeFactorRows(klines)
```

只算最后一个时点。

新增：

```ts
computeFactorSnapshot(
  klines,
  asOfDate
)
```

必须保证：

```text
数据切片 <= asOfDate
```

测试必须故意在未来日期加入极端价格：

```text
未来 +500%
```

然后验证：

```text
过去日期的 score 完全不变化
```

这是防 Look-ahead 的核心回归测试。

---

## 23.3 新建策略模块

```text
src/utils/quant/strategy.ts
```

接口：

```ts
buildSignalSnapshot(...)
selectTargets(...)
buildTargetWeights(...)
```

输出：

```ts
interface SignalSnapshot {
  signalDate: string
  tradeDate: string
  ranked: FactorRow[]
  selected: string[]
  weights: Record<string, number>
}
```

---

## 23.4 Walk-forward Engine

新增：

```text
src/utils/quant/walkForward.ts
```

流程：

```text
warmup
↓
逐交易日
↓
上一交易日生成信号
↓
当日 open 执行
↓
close 估值
↓
记录 NAV / Fill / Position
```

---

# 24. 不要每日全量再平衡

当前：

```text
每天重新等权
```

会产生不必要的：

```text
超高换手
佣金
滑点
```

V2 默认：

```text
每 5 个交易日
```

或者：

```text
每周
```

再平衡。

同时加入：

```text
偏离阈值
```

例如：

```text
|currentWeight - targetWeight| < threshold
→ 不交易
```

阈值做配置，不写死。

---

# 25. 量化：使用“完整交易日”生成信号

当前 K 线缓存：

```text
todayKey()
```

并且当日第一次进入量化页后：

```text
当天缓存不再刷新
```

存在两个语义问题：

### 问题 1

盘中日 K：

```text
尚未收盘
```

如果直接进入 MOM20：

```text
因子随盘中价格变化
```

但回测通常使用：

```text
收盘信号
```

### 问题 2

缓存按电脑本地日期：

```ts
new Date()
```

而不是：

```text
Asia/Shanghai 交易日
```

---

## 25.1 V2 定义两类信号

### 正式策略信号

```text
最近完整收盘交易日
```

UI：

```text
信号截至：2026-09-23 收盘
```

### 盘中预估

可选：

```text
盘中因子预估
```

但必须显示：

```text
未收盘
仅供观察
```

且：

```text
不得进入正式回测数据
```

---

# 26. 量化：自选池历史偏差

这是当前量化最容易被忽略的问题。

如果今天自选有：

```text
55 只
```

拿今天这 55 只股票回测过去两年，本质是：

```text
使用“今天知道会关注哪些股票”的信息
回看历史
```

这属于：

```text
Selection Bias
```

如果自选只保留当前仍上市的股票，还会叠加：

```text
Survivorship Bias
```

---

## 26.1 UI 必须明确

桌面轻量回测显示：

```text
固定自选池历史基准
```

不要显示为：

```text
全市场策略历史收益
```

---

## 26.2 真正研究

由 `a-share-quant` 提供：

```text
Point-in-Time Universe
```

例如每个交易日都有：

```text
当时上市
当时可交易
当时未停牌
当时属于股票池
```

的股票集合。

---

# 27. 量化：因子计算优化

当前：

```text
MOM20
REV5
VOL20
```

其中 `VOL20` 已计算，但未进入组合评分。

---

## 27.1 不要直接拍脑袋改权重

不要直接从：

```text
0.7 MOM + 0.3 REV
```

改成：

```text
0.5 MOM + 0.3 REV - 0.2 VOL
```

然后认为“优化完成”。

正确流程：

```text
候选因子
↓
IC
↓
ICIR
↓
分组收益
↓
Walk-forward
↓
成本后收益
↓
稳定性
↓
最终决定是否加入
```

---

## 27.2 第一批候选

在现有 OHLCV 数据基础上，可以研究：

### 趋势

```text
MOM20
MOM60
MA20 / MA60
价格距 MA20
```

### 短期反转

```text
REV3
REV5
```

### 风险

```text
VOL20
20日最大回撤
ATR / Price
```

### 量价

```text
20日成交量变化
量能趋势
成交量异常
```

需要注意：

如果数据接口没有可靠成交额历史：

```text
不要伪造 turnover 因子
```

---

# 28. 因子预处理

当前标准化：

```text
普通 mean/std z-score
```

对小股票池和极端值较敏感。

V2 增加：

```text
Winsorize
+
Robust Z-score
```

候选：

```text
median
MAD
```

---

## 28.1 最低横截面数量

如果自选：

```text
只有 2~3 只
```

横截面 z-score 排名会产生虚假的精确感。

增加：

```ts
MIN_CROSS_SECTION_SIZE
```

建议初始：

```text
10
```

低于阈值：

```text
仍显示原始因子
不显示综合排名
```

阈值必须可测试和调整。

---

# 29. 因子有效性检验

新建：

```text
src/utils/quant/validation.ts
```

研究端完整版可以放 Python。

指标：

### IC

```text
Spearman(
  今日因子排名,
  未来 N 日收益排名
)
```

### ICIR

```text
mean(IC) / std(IC)
```

### 分组收益

将股票按因子分：

```text
Q1
Q2
Q3
Q4
Q5
```

观察：

```text
收益是否单调
```

### 稳定性

按：

```text
年度
牛市
震荡
下跌
```

分别观察。

桌面 App 不必实时全部计算，可以从研究报告展示。

---

# 30. 当前评分加权也需要验证

当前：

```ts
weight = max(0.5 + composite, 0.05)
```

这是工程上可运行，但经济含义较弱。

V2 保留：

```text
equal
```

作为默认基准。

新增候选：

```text
rank-weight
softmax
inverse-vol
score × inverse-vol
```

但每种都必须通过：

```text
Walk-forward
成本
最大回撤
换手率
```

比较后再决定。

---

# 31. 风险控制层

不要让因子直接输出最终持仓。

增加：

```text
Signal
↓
Portfolio Constructor
↓
Risk Control
↓
Target Portfolio
```

---

## 31.1 风控配置

```ts
interface PortfolioRiskConfig {
  maxSingleWeight: number
  maxIndustryWeight?: number
  maxTurnover?: number
  minCashWeight?: number
  volatilityTarget?: number
}
```

第一版只做：

```text
单票最大权重
最小交易偏离
最大单次换手
```

行业约束需要可靠行业数据后再加。

---

# 32. 回测价格体系必须分离

当前因子使用：

```text
hfq
```

这是为了减少前复权历史因子受未来复权变化影响的问题。

但：

```text
回测成交价格
佣金
最低佣金
涨跌停价格
100股整手
```

应该尽量使用：

```text
未复权真实价格
```

因此 V2 数据模型：

```ts
interface QuantBar {
  date: string

  rawOpen: number
  rawHigh: number
  rawLow: number
  rawClose: number
  rawPrevClose: number

  adjustedClose: number

  volume: number
}
```

使用：

```text
adjustedClose
→ 因子

rawOpen/rawClose
→ 交易和估值
```

---

## 32.1 数据接口改造

Rust：

```text
fetch_kline_series
```

扩展：

```text
raw / none
qfq
hfq
```

具体腾讯参数先通过真实接口样本验证，不要未经验证直接假设 `"none"` 参数。

增加接口测试：

```text
同一股票同一日期
raw price != adjusted price（发生除权时）
```

---

# 33. 公司行为

准确的持仓级回测还要处理：

```text
分红
送股
转增
配股
除权
```

V2 可以分两级。

### Desktop Lite

使用复权收益近似：

```text
用于策略相对比较
```

UI 标记：

```text
简化公司行为模型
```

### Research Full

`a-share-quant` 使用：

```text
Point-in-Time corporate actions
```

真正调整：

```text
shares
cash
cost
```

---

# 34. 成交模型优化

日 K 回测无法知道：

```text
盘口深度
涨停排队
盘中真实成交机会
```

因此不要显示成“完全真实成交”。

---

## 34.1 开盘涨停 / 跌停

第一版：

```text
open >= limitUp
→ 不允许开盘买

open <= limitDown
→ 不允许开盘卖
```

这是严格的“开盘成交”假设。

---

## 34.2 停牌

没有有效开盘价：

```text
不交易
```

估值：

```text
沿用 last known close
```

---

## 34.3 T+1

当前引擎已有基本 T+1 逻辑。

继续保留，并增加测试：

```text
当天买入
当天出现卖出信号
→ 不得卖出
```

---

## 34.4 整手

不要只用全市场：

```text
lotSize = 100
```

证券规则未来可以由 SecurityMeta 提供。

---

# 35. 规则必须版本化

2026 年主板风险警示涨跌幅规则变化本身说明：

```text
交易规则不是永远固定
```

新增：

```ts
interface RuleVersion {
  effectiveFrom: string
  exchange: 'SSE' | 'SZSE' | 'BSE'
  board: string
  limitRatio: number | null
}
```

回测：

```text
tradeDate
↓
选择当日有效规则
```

否则用今天的规则回测过去，也可能产生历史误差。

---

# 36. 回测指标 V2

当前：

```text
总收益
年化
最大回撤
```

V2 增加：

```text
年化波动率
Sharpe
Sortino
Calmar
交易次数
换手率
手续费总额
滑点成本
持仓数量
平均持有天数
```

---

# 37. 基准对比

当前 Rust：

```text
fetch_index_history
```

只支持：

```text
沪深300
```

V2 先保留沪深300默认 Benchmark。

回测结果：

```text
策略 NAV
Benchmark NAV
```

展示：

```text
策略年化
基准年化
年化超额
最大回撤
超额最大回撤
```

后续增加：

```text
上证指数
中证500
创业板指
```

---

# 38. BacktestResult V2

建议：

```ts
interface BacktestResultV2 {
  nav: NavPoint[]
  benchmarkNav?: NavPoint[]

  totalReturn: number
  annualizedReturn: number
  annualizedVolatility: number

  benchmarkReturn?: number
  excessReturn?: number

  sharpe?: number
  sortino?: number
  calmar?: number

  maxDrawdown: number

  turnover: number
  totalCommission: number
  totalTax: number
  totalSlippage: number

  tradeCount: number
  rebalanceCount: number

  assumptions: string[]
}
```

---

# 39. Quant Report V2

当前 Report V1：

```text
strategy_id
metrics
evidence_status
nav
interval
data_hash
source_pool_size
```

V2 建议：

```json
{
  "report_version": 2,
  "generated_at": "...",
  "strategy_id": "...",
  "strategy_version": "...",
  "code_version": "...",

  "universe": {
    "type": "point_in_time",
    "name": "...",
    "source_pool_size": 0
  },

  "interval": {
    "start": "...",
    "end": "..."
  },

  "benchmark": {
    "code": "000300",
    "name": "沪深300"
  },

  "config": {
    "top_n": 5,
    "rebalance": "weekly",
    "weight_mode": "equal"
  },

  "metrics": {},
  "costs": {},
  "assumptions": [],

  "nav": [],
  "benchmark_nav": [],
  "turnover": [],

  "data_hash": "..."
}
```

---

# 40. 当前 Report Parser 有一个小问题

当前：

```ts
const fills = raw.fills.slice(0, MAX_FILLS)

if (fills.length > MAX_FILLS) {
  return null
}
```

这里：

```text
先 slice
再判断 > MAX_FILLS
```

后面的判断永远不会为 true。

而且当前 `fills` 最后没有进入返回结构。

V2：

```ts
if (raw.fills.length > MAX_FILLS) {
  return null
}
```

之后再：

```text
slice / parse
```

---

## 40.1 Report 输入严格验证

不要：

```ts
metrics as Record<string, number | null>
```

直接信任 JSON。

验证：

```text
metric 是有限 number 或 null
date 是合法日期
nav.value > 0
nav 日期单调
strategyId 非空
interval 合法
```

同时限制文件：

```text
最大 5~10 MB
```

避免超大 JSON 阻塞 WebView。

---

# 41. Quant Cache V2

当前：

```text
内存 Map
按 todayKey 缓存
```

轻量场景没问题。

但建议：

```text
signal cache
market cache
```

分开。

---

## 41.1 Cache Key

不要只：

```text
code + today
```

至少：

```text
code
adjust
count
lastCompleteTradeDate
```

例如：

```text
600000|hfq|320|2026-09-23
```

---

## 41.2 研究信号缓存

历史已收盘数据：

```text
直到出现新的完整交易日才失效
```

盘中不要反复重拉整套 320 日历史。

---

# 42. Quant UI V2

目标不是堆数据，而是让用户知道：

```text
这是什么
数据截至什么时候
能否相信
与回测是否对应
```

---

## 42.1 左列：因子

建议：

```text
量化 · 自选池

信号截至：
2026-09-23 收盘

股票          MOM20     REV5     VOL20    综合
A               ...      ...       ...      ...
B               ...      ...       ...      ...
```

点击行展开：

```text
因子原始值
标准分
最终贡献
```

---

## 42.2 右列：目标组合

当前 holdings comparison 的最新改造方向是正确的：

> 只根据真实录入持仓进行比较，不再让“用户输入总资产”与持仓内部权重混合。

该改动已经出现在最新 Commit：

```text
ce3fde1
```

V2 保留。

展示：

```text
已录持仓 5
可估值 5
目标 Top5

股票       当前       目标      偏离
A         22%        20%        +2%
B         10%        20%       -10%
```

如果行情缺失：

```text
当前权重 --
```

不要推断。

---

## 42.3 右列：回测

分两块。

### 基准

```text
固定自选池等权基准
```

### 策略

```text
Walk-forward Top5
0.7 MOM20 + 0.3 REV5
每周调仓
等权
```

两者不能混成一个。

---

## 42.4 研究状态

显示：

```text
Exploratory
Validated
Out-of-sample
```

但含义需要固定。

例如：

### Exploratory

```text
样本内研究
```

### Validated

```text
通过预设 Walk-forward / OOS 检验
```

不能只因为收益高就自动变 Validated。

---

# 43. 因子研究推荐流程

每加入一个新因子：

```text
提出假设
↓
确定公式
↓
禁止未来数据
↓
IC / 分组
↓
Walk-forward
↓
计成本
↓
参数敏感性
↓
与旧模型比较
↓
决定保留 / 删除
```

不要：

```text
看收益高 → 保留
```

否则非常容易过拟合。

---

# 44. 参数敏感性

例如当前：

```text
MOM20
REV5
0.7 / 0.3
Top5
```

研究：

```text
MOM:
10 / 20 / 40 / 60

REV:
3 / 5 / 10

TopN:
3 / 5 / 10 / 20

Rebalance:
daily / 5d / weekly / 20d
```

重点不是找：

```text
收益最高的唯一参数
```

而是找：

```text
一大片参数区域都能工作
```

这通常更可靠。

---

# 45. 样本外验证

建议研究端至少区分：

```text
Train
Validation
Test
```

或者：

```text
Rolling Walk-forward
```

例如：

```text
过去 N 月选参数
下一阶段固定参数运行
然后滚动
```

测试期不能重新调参。

---

# 46. 量化 V2 推荐架构

前端：

```text
src/utils/quant/
│
├── types.ts
├── cache.ts
│
├── factors.ts
├── preprocess.ts
├── scoring.ts
├── selector.ts
│
├── rules.ts
├── strategy.ts
├── holdings.ts
│
├── backtest.ts
├── walkForward.ts
├── metrics.ts
├── validation.ts
│
└── report.ts
```

如果继续膨胀：

```text
backtest/
  engine.ts
  execution.ts
  metrics.ts
```

再拆。

不要一开始过度目录化。

---

# 47. Quant 开发阶段

## Q0：Correctness

必须先完成：

- [ ] 修复 close 判断开盘涨跌停的未来信息；
- [ ] 回测标题改为“固定自选池等权基准”；
- [ ] 固定完整收盘日信号语义；
- [ ] 中国时区交易日期；
- [ ] Report Parser 长度判断问题；
- [ ] 增加 Look-ahead Regression Test。

---

## Q1：Strategy Backtest

- [ ] `StrategyConfig`
- [ ] `SignalSnapshot`
- [ ] `computeFactorSnapshot(asOfDate)`
- [ ] TopN 历史选择
- [ ] D-1 signal → D open
- [ ] weekly / every5 rebalance
- [ ] target weights
- [ ] strategy NAV

---

## Q2：Benchmark & Metrics

- [ ] 沪深300 benchmark
- [ ] Sharpe
- [ ] Sortino
- [ ] Calmar
- [ ] Volatility
- [ ] Turnover
- [ ] Fees
- [ ] Excess Return
- [ ] 双 NAV 曲线

---

## Q3：Factor Validation

- [ ] Winsorize
- [ ] Robust Z-score
- [ ] Minimum cross section
- [ ] IC
- [ ] ICIR
- [ ] Quintile returns
- [ ] Parameter sensitivity
- [ ] OOS 标记

---

## Q4：Rules / Data Realism

- [ ] raw OHLC
- [ ] adjusted factor price
- [ ] SecurityMeta
- [ ] effective-date rule
- [ ] IPO / no-limit metadata
- [ ] suspension
- [ ] delisting-period metadata
- [ ] corporate-action strategy

---

# 48. 量化测试矩阵

## 48.1 Look-ahead

创建：

```text
Day 1~100 正常
Day 101 突然 +500%
```

计算 Day 80 信号。

要求：

```text
加入 Day101 前后
Day80 信号完全一致
```

---

## 48.2 开盘涨停

```text
prevClose = 10
open = 11
close = 10.5
```

主板：

```text
开盘触及涨停
```

如果策略要求开盘成交：

```text
不得买
```

不能因为：

```text
close 不是涨停
```

就允许买。

---

## 48.3 收盘涨停但开盘未涨停

```text
prevClose = 10
open = 10.2
close = 11
```

策略：

```text
开盘允许买
```

不能因为收盘涨停拒绝。

---

## 48.4 T+1

```text
D 开盘买
D 下午产生卖出条件
```

不得当日卖。

---

## 48.5 未来股票池

回测日期：

```text
2024
```

向池中加入：

```text
2026 才上市股票
```

PIT 模式必须：

```text
2024 不出现
```

---

## 48.6 手续费

测试：

```text
小额交易
```

必须触发：

```text
minimum commission
```

卖出：

```text
税费
```

只按配置方向收取。

---

# 49. 当前已经完成、不需要重复开发的量化改进

审查最新 Commit：

```text
ce3fde1
refactor(quant): holdings comparison module, total-assets mode removed
```

当前已经完成：

### 1. 移除“用户输入总资产”推算现金模式

这是正确的。

避免：

```text
真实录入持仓
+
用户输入总资产
```

产生两套互相冲突的权重口径。

### 2. 新增 `holdings.ts`

通过：

```text
shares × 实时报价
```

计算真实已录持仓内部权重。

### 3. 缺失报价时不猜

返回：

```text
null
```

而不是用 0。

### 4. 报告显示固定池规模

内置报告明确：

```text
历史固定池
```

而不是假装等于当前自选池。

这些全部保留作为 V2 baseline。

---

# 50. 量化产品定位建议

V2 后量化模块建议定位：

> **研究与组合观察助手，不做自动交易器。**

首页不是显示：

```text
强烈买入
卖出
```

而是：

```text
因子排名
策略候选
目标权重
当前偏离
历史验证
数据状态
```

这样：

- 更符合工具定位；
- 更容易解释；
- 不会把一个轻量模型包装成确定性预测。

---

# 51. 推荐最终 V2 页面结构

```text
┌──────────────────────────────┐
│ 量化 · 自选池                │
│ 信号截至 09-23 收盘          │
│ 数据 55 / 可评分 52          │
├─────────────┬────────────────┤
│ 因子排名     │ 组合状态       │
│              │                │
│ 1 A          │ 当前 / 目标    │
│ 2 B          │                │
│ 3 C          │ 偏离           │
│ ...          │                │
├─────────────┼────────────────┤
│ 因子详情     │ 策略验证       │
│ MOM          │ Walk-forward   │
│ REV          │ Benchmark      │
│ VOL          │ DD / Sharpe    │
└─────────────┴────────────────┘
```

---

# 52. 最终代码结构建议

```text
src/
├── api/
├── components/
│   ├── home/
│   ├── stock/
│   ├── fund/
│   └── quant/
├── composables/
├── services/
│   ├── updater.ts
│   └── refreshScheduler.ts
├── stores/
├── utils/
│   ├── refreshPolicy.ts
│   ├── tradingSession.ts
│   ├── persistence.ts
│   ├── migrations/
│   └── quant/
└── views/

src-tauri/src/
├── main.rs
├── commands/
├── providers/
├── parsers/
├── models/
├── http.rs
├── ocr.rs
├── app_log.rs
└── window_state.rs
```

---

# 53. 推荐实施顺序

必须严格按正确性风险排序。

## Stage A

```text
Updater
SmartScreen
CSP
Security Tests
```

---

## Stage B

```text
量化 Look-ahead 修复
基准回测重命名
Quant Regression Tests
```

---

## Stage C

```text
RefreshScheduler
Sparkline 降频/限流
交易时段
Quote Freshness
Market Request Sequence
```

---

## Stage D

```text
Walk-forward
StrategyConfig
TopN 历史策略回测
Benchmark
Metrics
```

---

## Stage E

```text
Persistence V2
CI E2E
Clippy
Version Check
```

---

## Stage F

```text
Rust main.rs 拆分
Home / Detail 拆分
Provider 抽象
```

---

## Stage G

```text
IC / ICIR
Factor Research
Risk Control
Point-in-Time Universe
Report V2
```

---

# 54. 每阶段完成标准

任何 Stage 不以：

```text
代码写完
```

作为完成标准。

必须：

```text
Unit Test
+
Build
+
E2E
+
真实 Windows App 验证
```

---

# 55. V2 最终验收清单

## 安全

- [ ] 不存在 `run_installer(path)`
- [ ] 更新包签名验证
- [ ] 篡改更新包不能安装
- [ ] SmartScreen 不被关闭
- [ ] CSP 收紧
- [ ] Capability 最小化

## 行情

- [ ] 股票批量行情正常
- [ ] Sparkline 不再 30 秒全量请求
- [ ] 休市停止高频刷新
- [ ] 每只股票显示 source freshness
- [ ] 市场快速切换不会串数据
- [ ] 请求失败保留旧数据

## 持久化

- [ ] V1 → V2 Migration
- [ ] 最后 300ms 修改不会轻易丢失
- [ ] file / shadow 有 revision

## 工程

- [ ] `main.rs` 只负责组装
- [ ] Home / Detail 职责拆分
- [ ] E2E 进入 CI
- [ ] Clippy
- [ ] 三版本号自动检查

## 量化

- [ ] 无明确 Look-ahead
- [ ] 开盘交易不使用当天收盘信息
- [ ] 因子信号只使用 as-of 日期以前数据
- [ ] “基准回测”与“策略回测”完全分开
- [ ] TopN 真正进入历史 Walk-forward
- [ ] 支持非每日调仓
- [ ] 成本进入回测
- [ ] Benchmark
- [ ] Sharpe / Calmar / Turnover
- [ ] 固定自选池偏差明确显示
- [ ] Research Report V2 严格验证
- [ ] 交易规则支持 effective date

---

# 56. 参考资料

## Tauri

- Tauri V2 Updater：
  https://v2.tauri.app/plugin/updater/

- Tauri GitHub Actions：
  https://v2.tauri.app/distribute/pipelines/github/

## WebView2

- Browser Flags：
  https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/webview-features-flags

- WebView2 Security：
  https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security

## 2026 A 股交易规则

- 上海证券交易所交易规则（2026 年修订）：
  https://www.sse.com.cn/lawandrules/sselawsrules2025/stocks/exchange/c/c_20260424_10816482.shtml

- 深圳证券交易所交易规则（2026 年修订）：
  https://investor.szse.cn/lawrules/rule/trade/t20260424_620190.html

- 北京证券交易所交易规则（2026 年）：
  https://www.bse.cn/jygl_list/200028217.html

---

# 57. 结论

A+助手当前最需要的不是再增加十几个行情按钮，而是完成三个核心升级：

```text
① 安全升级
② 行情调度升级
③ 量化可信度升级
```

工程部分最重要：

```text
手工 EXE 更新
→ 官方签名 Updater

30 秒所有数据一起刷新
→ 分层刷新调度器

超大 main.rs / Vue 文件
→ 按职责模块化
```

量化部分最重要：

```text
当前评分
+
独立固定池等权回测
```

升级为：

```text
历史 as-of 信号
        ↓
Walk-forward
        ↓
Top-N
        ↓
下一交易日执行
        ↓
真实成本 / 交易规则
        ↓
Benchmark / Risk Metrics
        ↓
OOS / IC 验证
```

做到这一层后，A+助手的量化部分才从：

> “有一个评分和回测页面”

升级为：

> **“当前信号、真实持仓与历史证据能够互相对应的轻量量化研究终端”。**
