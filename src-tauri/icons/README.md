# 图标文件说明

此目录需要包含以下图标文件才能成功构建：

## 必需文件

| 文件名 | 尺寸 | 用途 |
|--------|------|------|
| icon.ico | 256x256 | Windows 应用图标 |
| icon.png | 128x128 | 系统托盘图标 |
| 32x32.png | 32x32 | 小尺寸图标 |
| 128x128.png | 128x128 | 中等尺寸图标 |
| 128x128@2x.png | 256x256 | 高分屏图标 |

## 生成图标

### 方法一：在线工具
1. 准备一张 512x512 的 PNG 图片
2. 访问 https://icoconvert.com/ 转换为 .ico
3. 使用 https://iconifier.net/ 生成各尺寸 PNG

### 方法二：使用 npm 工具
```bash
npm install -D @aspect/tauri-icon
npx @aspect/tauri-icon assets/logo.png
```

### 方法三：Tauri CLI
```bash
npm run tauri icon assets/logo.png
```

## 临时解决方案

开发阶段可以使用任意 PNG 图片作为托盘图标：
```bash
# 将任意 128x128 PNG 复制为 icon.png
cp your-image.png icon.png
```