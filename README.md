# 小A助手

基于 Tauri 2.0 + Vue 3 构建的 Windows 股票桌面小组件。

## 功能特性

- 股票实时行情（腾讯财经 API）
- 自选股管理（添加/删除）
- 股票搜索（名称/代码）
- 股票详情页（K线图）
- 30秒自动刷新
- macOS 风格标题栏
- 系统托盘
- 开机自启
- 窗口置顶
- 深色/浅色主题
- 背景透明度调节
- 最小化轮播模式

## 技术栈

| 技术 | 说明 |
|------|------|
| Tauri 2.0 | 跨平台桌面框架 |
| Vue 3 | 前端框架 |
| TypeScript | 类型支持 |
| Pinia | 状态管理 |
| UnoCSS | 原子化CSS |
| ECharts | K线图表 |

## 前置要求

- Node.js >= 18.x
- Rust >= 1.70（Tauri 需要）
- Windows 10/11

### 安装 Rust

```bash
# 访问 https://rustup.rs/ 下载并安装
# 或使用 winget
winget install Rustlang.Rustup
```

## 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run tauri:dev

# 仅启动前端（无需 Rust）
npm run dev

# 构建生产版本
npm run tauri:build
```

## 项目结构

```
stock-widget/
├── src/                    # Vue 前端代码
│   ├── api/stock.ts        # 股票数据 API
│   ├── stores/             # Pinia 状态管理
│   ├── views/              # 页面组件
│   ├── components/         # 可复用 UI 组件
│   └── App.vue             # 根组件
├── src-tauri/              # Rust 后端
│   ├── src/main.rs         # 主进程入口
│   └── tauri.conf.json     # Tauri 配置
├── index.html              # 入口 HTML
├── vite.config.ts          # Vite 配置
├── uno.config.ts           # UnoCSS 配置
└── package.json
```

## API 说明

使用腾讯财经 API 获取实时行情：

- 实时行情：`https://qt.gtimg.cn/q={codes}`
- 股票代码格式：`sh600000`（上海）、`sz000001`（深圳）

## 常见问题

**Rust 编译错误**

```bash
rustup update stable
```

**图标缺失**

构建前需准备图标文件放入 `src-tauri/icons/` 目录：
- `icon.ico` - Windows 图标
- `icon.png` - 托盘图标

可使用在线工具生成：
- https://icoconvert.com/
- https://www.flaticon.com/

**网络请求失败**

腾讯 API 需要 CORS 支持，Tauri 默认允许跨域请求。
