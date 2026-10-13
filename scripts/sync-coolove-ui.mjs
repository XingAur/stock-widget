// 从同级目录的 coolove-ui 仓库同步样式与 Vue 接入代码到 src/coolove-ui。
// 用法：npm run sync:ui            （默认读取 ../coolove-ui）
//      COOLOVE_UI_DIR=D:/Code/coolove-ui npm run sync:ui
import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = resolve(process.env.COOLOVE_UI_DIR || join(root, '..', 'coolove-ui'))
const target = join(root, 'src', 'coolove-ui')
const files = [
  ['coolove-ui.css', 'coolove-ui.css'],
  ['vue/useCooloveTheme.ts', 'useCooloveTheme.ts']
]

if (!existsSync(join(source, 'coolove-ui.css'))) {
  console.error(`找不到 coolove-ui：${source}`)
  process.exit(1)
}

mkdirSync(target, { recursive: true })
for (const [from, to] of files) {
  copyFileSync(join(source, from), join(target, to))
}
const version = readFileSync(join(source, 'coolove-ui.css'), 'utf8').match(/Coolove UI v([\d.]+)/)?.[1] ?? 'unknown'
console.log(`已同步 coolove-ui v${version} → src/coolove-ui`)
