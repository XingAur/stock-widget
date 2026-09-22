# A+助手

Windows 桌面股票/基金行情小组件。常驻桌面的小窗口，一眼看清自选行情与持仓盈亏，内置市场助手与板块热度，支持持仓截图一键导入。

![Platform](https://img.shields.io/badge/platform-Windows-blue) ![Tauri](https://img.shields.io/badge/Tauri-2-orange) ![Vue](https://img.shields.io/badge/Vue-3-brightgreen)

## 下载安装

从 [GitHub Releases](https://github.com/XingAur/stock-widget/releases) 下载最新版安装包：

- `APlus_Assistant_x.x.x_x64-setup.exe`（NSIS 中文安装器，支持覆盖升级）

系统要求：Windows 10 / Windows 11（自带 Edge WebView2 运行时）。

## 功能总览

### 自选行情（股票 / 基金）

- 股票：实时价格、涨跌幅、分时走势迷你图、账户市值/当日预计收益/总收益汇总
- 基金：单位净值 / 盘中估算净值（基于持仓股票实时加权）、板块标签、持有收益
- 顶部标题点击切换 股票 ⇄ 基金；搜索框支持名称/代码搜索与直接回车添加
- 卡片右键菜单：录入持仓、上移/下移、置顶/置底；卡片左侧把手可拖动排序
- 30 秒自动刷新，刷新失败保留上次数据并标记"失败/延迟"

### 持仓与收益（对齐支付宝 / 天天基金口径）

- 股票持仓：成本价 + 股数 → 市值、盈亏、盈亏率
- 基金账本：移动加权平均成本，申购费按证监会规范外扣法（净申购 = 申购金额 ÷ (1 + 费率)）
- 当日收益 =（当前价 − 上一收盘价/净值）× 份额；当日买入份额不计当日收益（T+1 口径）
- 基金详情页支持买入/卖出/调整记录、历史净值快照、收益走势图、持仓结构估算

### 市场助手（底部地球按钮）

- 四个市场页签：**A股 / 美股 / 港股 / 全球**
- A股与美股默认显示板块数据，可一键切换指数：
  - A股三段切换「行业 | 概念 | 指数」：行业板块与概念板块全量展示，按主力净流入（热门程度）排序，卡片显示成分股涨跌家数
  - 美股两段切换「行业 | 指数」：标普 11 大行业（SPDR 行业 ETF）+ 道琼斯/纳斯达克/标普500
  - 港股（恒生/恒生科技/国企）、全球（日经225、韩国KOSPI、富时100、德国DAX、法国CAC40、孟买SENSEX）
- 开市状态指示（● 盘中呼吸灯），开市每 60 秒自动刷新，休市自动停止；页签选择重启保留

### 持仓截图导入（图片按钮）

- 选择券商/基金 App 的持仓截图，本地 OCR 识别（Windows 系统自带中文识别，离线、不上传图片）
- 股票截图自动提取 6 位代码；基金截图按名称自动联网反查代码
- 导入前逐项勾选确认；同一图内重复自动合并，已存在的自选自动标记排除

### 窗口体验

- 无边框圆角悬浮窗，任意空白处按住即可拖动（标题栏、列表间隙、详情页均支持）
- 窗口位置与尺寸自动记忆，重启回到原位；多显示器拔插自动回到可视区域
- 单实例：重复启动直接唤起已有窗口，避免数据冲突与空白窗口
- 点 × 隐藏到托盘常驻（托盘菜单：恢复窗口 / 退出）；支持开机自启、置顶、透明度、主题与字体设置

## 数据来源

- 股票/指数/港股行情：腾讯行情接口（qt.gtimg.cn）
- 全球指数与板块：东方财富公开接口（日经/KOSPI/欧洲印度指数、行业与概念板块、SPDR 行业 ETF）
- 基金净值与档案：天天基金/东方财富（单位净值、历史净值、持仓估算、基金资料）
- 数据仅用于展示与研究，可能延迟或中断，不构成投资建议

## 本地数据

所有自选、持仓、账本与设置仅保存在本机：

- `app-state.json`（应用状态，原子写入）
- `window-state.json`（窗口位置尺寸）
- WebView 本地存储（旧版本数据自动迁移）

## 开发

```bash
npm install          # 安装依赖
npm run tauri:dev    # 桌面开发调试
npm run test         # 前端单测（Vitest）
npm run test:e2e     # Playwright E2E（mock Tauri IPC）
npm run build        # 类型检查 + 前端构建
npm run tauri:build  # 生成 NSIS 安装包
```

Rust 侧：

```bash
cd src-tauri
cargo test
cargo fmt --check    # CI 强制要求
```

## 发布流程

1. 版本号三处同步：`package.json`、`src-tauri/tauri.conf.json`、`src-tauri/Cargo.toml`
2. 提交并推送 `main`（CI 自动跑全量测试）
3. 打标签并推送：`git tag v1.0.6 && git push origin v1.0.6`
4. GitHub Actions 自动构建并创建 Release（`.github/workflows/release.yml`）

## 项目结构

```text
├─ .github/workflows/       # CI 与自动发布
├─ e2e/                     # Playwright E2E 与 Tauri IPC mock
├─ src/
│  ├─ api/                  # Tauri 命令调用与类型
│  ├─ components/           # 标题栏、导入弹窗、基金图表组件
│  ├─ stores/               # Pinia 状态（自选/持仓/设置）与持久化
│  ├─ styles/               # 全局主题
│  ├─ utils/                # 持久化、账本、市场分组、OCR 解析、图表、拖动等工具
│  └─ views/                # 首页、市场助手、股票/基金详情、设置
├─ src-tauri/
│  ├─ src/main.rs           # 行情命令、全球指数、板块、OCR、窗口管理
│  ├─ src/http.rs           # HTTP 请求与 GBK 解码
│  ├─ src/ocr.rs            # Windows 系统 OCR
│  └─ nsis/                 # 中文安装器模板
```

## 技术栈

Tauri 2 · Rust · Vue 3 · TypeScript · Pinia · UnoCSS · Vitest · Playwright · NSIS

## 免责声明

本项目只提供行情展示、自选维护和本地持仓盈亏估算，不提供交易能力；数据仅用于信息展示与技术研究，不构成投资建议；正式投资决策应以交易所、基金公司和持牌机构信息为准。
