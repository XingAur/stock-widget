# A+ Assistant

基于 `Tauri 2 + Vue 3 + TypeScript` 构建的 Windows 桌面行情小组件，面向 A 股和开放式基金自选查看场景。应用强调常驻桌面、低打扰、快速查看和轻量维护。

## 功能

- 股票自选
  - 股票名称 / 代码搜索
  - 添加、删除、右键排序和拖拽排序
  - 30 秒自动刷新
  - 股票详情页：分时图、K 线、均线、五档买卖盘
- 基金自选
  - 股票 / 基金分段切换
  - 基金名称 / 代码搜索
  - 添加、删除、右键排序和拖拽排序
  - 展示基金名称、代码、估算净值、估算涨跌幅、单位净值、净值日期、估算更新时间
  - 基金第一版仅做列表估算展示，不提供详情页、历史净值图和 K 线
- 列表拖拽
  - 卡片左侧提供专用拖拽手柄
  - 拖动启动阈值为 6px，减少误触
  - 拖动目标位置高亮
  - 股票点击仍打开详情，删除按钮和拖拽互不干扰
- 窗口和设置
  - 深色 / 浅色 / 自定义主题
  - 背景透明度和字体切换
  - 大盘指数与 sparkline 显示开关
  - 窗口置顶、最小化到托盘、开机自启
  - 置顶和自启切换期间会进入 pending 状态，失败时回滚 UI
  - 恢复默认会同步关闭置顶和自启，系统副作用失败时不会覆盖本地设置
  - 启动后会按本地设置重新应用置顶状态，保证 UI 与窗口实际状态一致

## 技术栈

- Tauri 2
- Vue 3
- TypeScript
- Pinia
- Vite
- UnoCSS
- Rust

## 运行环境

- Windows 10 / Windows 11
- Node.js 18+
- Rust stable

## 快速开始

```bash
npm install
npm run tauri:dev
```

仅调试前端界面时可以运行：

```bash
npm run dev
```

构建桌面应用：

```bash
npm run tauri:build
```

## 验证与维护

前端单元测试：

```bash
npm run test
```

前端类型检查与生产构建：

```bash
npm run build
```

Rust / Tauri 侧测试和编译检查：

```bash
cd src-tauri
cargo test
cargo check
```

提交前建议再运行：

```bash
git diff --check
```

## 项目结构

```text
stock-widget/
├── src/
│   ├── api/                 # 前端数据访问层
│   ├── components/          # 通用 UI 组件
│   ├── stores/              # Pinia 状态管理
│   ├── styles/              # 全局样式
│   ├── utils/               # 格式化、图表、列表纯逻辑
│   ├── views/               # 页面视图
│   ├── App.vue              # 应用主布局
│   └── main.ts              # 前端入口
├── src-tauri/
│   ├── src/main.rs          # Tauri / Rust 后端入口
│   ├── capabilities/        # Tauri 权限配置
│   └── tauri.conf.json      # Tauri 应用配置
├── package.json
├── vite.config.ts
└── uno.config.ts
```

## 数据来源

当前版本使用公开接口获取行情和搜索数据：

- 股票行情：腾讯行情相关接口
- 股票搜索：新浪搜索建议接口
- 基金搜索：东方财富基金搜索接口
- 基金估算：天天基金 `fundgz.1234567.com.cn/js/{code}.js`

这些接口并非由本项目维护，返回结构、可用性、频率限制和估算更新时间都可能变化。基金估算按开放式基金的估算净值 / 估算涨跌幅理解，不等同于交易所逐笔价格。接口异常时，基金批量刷新会保留已存在的旧数据，单条失败不阻塞其他基金。

## 已知说明

- 当前主要面向 Windows 桌面环境
- 本项目不提供交易能力
- 数据仅用于信息展示和技术研究，不构成投资建议
- 如需长期维护或商用，建议抽象数据层并切换到更稳定、合规的正式数据服务
