/**
 * 全局快捷键的字符串约定：
 * - 存储/传给 Rust 的格式为 `Alt+Q`、`Ctrl+Shift+F5`，修饰键在前、主键在后；
 * - 空字符串表示"未设置/已停用"；
 * - 显示时由 formatShortcut 转成带空格的 `Alt + Q`。
 */
export const DEFAULT_SHOW_SHORTCUT = 'Alt+Q'
export const DEFAULT_HIDE_SHORTCUT = 'Alt+W'

export const SHORTCUT_MODIFIERS = ['Ctrl', 'Alt', 'Shift', 'Super'] as const
export type ShortcutModifier = typeof SHORTCUT_MODIFIERS[number]

const MODIFIER_ORDER: ShortcutModifier[] = [...SHORTCUT_MODIFIERS]

const NAMED_KEYS = new Set([
  'Space',
  'Enter',
  'Tab',
  'Backspace',
  'Delete',
  'Home',
  'End',
  'Insert',
  'PageUp',
  'PageDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'ArrowDown'
])

const KEY_PATTERN = /^(?:[A-Z]|\d|F(?:[1-9]|1\d|2[0-4])|Num\d|Space|Enter|Tab|Backspace|Delete|Home|End|Insert|PageUp|PageDown|ArrowUp|ArrowLeft|ArrowRight|ArrowDown)$/

const MODIFIER_KEY_NAMES = new Set(['Control', 'Alt', 'Shift', 'Meta', 'AltGraph'])

export type ShortcutCapture =
  | { type: 'shortcut'; value: string }
  | { type: 'cancel' }
  | { type: 'clear' }
  | { type: 'invalid' }
  | { type: 'ignore' }

export function splitShortcut(value: string): string[] {
  return value
    .split('+')
    .map((token) => token.trim())
    .filter(Boolean)
}

/** 是否为合法的快捷键组合：至少一个修饰键 + 一个可识别的主键。 */
export function isValidShortcut(value: string): boolean {
  const tokens = splitShortcut(value)
  if (tokens.length < 2) return false

  const key = tokens[tokens.length - 1]
  const modifiers = tokens.slice(0, -1)
  if (!KEY_PATTERN.test(key)) return false

  return modifiers.every((token) => MODIFIER_ORDER.includes(token as ShortcutModifier))
}

/** 展示用格式：`Ctrl + Alt + Q`，Super 在 Windows 上显示为 Win。 */
export function formatShortcut(value: string): string {
  if (!value.trim()) return '未设置'
  return splitShortcut(value)
    .map((token) => (token === 'Super' ? 'Win' : token))
    .join(' + ')
}

function resolveKeyToken(event: KeyboardEvent): string | null {
  const code = event.code
  const letter = /^Key([A-Z])$/.exec(code)
  if (letter) return letter[1]

  const digit = /^Digit(\d)$/.exec(code)
  if (digit) return digit[1]

  const numpad = /^Numpad(\d)$/.exec(code)
  if (numpad) return `Num${numpad[1]}`

  const functionKey = /^F(\d{1,2})$/.exec(code)
  if (functionKey) {
    const index = Number(functionKey[1])
    return index >= 1 && index <= 24 ? `F${index}` : null
  }

  return NAMED_KEYS.has(code) ? code : null
}

/** 把键盘事件转换成快捷键字符串；Escape 取消、无修饰键的删除键清空。 */
export function captureShortcut(event: KeyboardEvent): ShortcutCapture {
  if (event.key === 'Escape') return { type: 'cancel' }
  if (MODIFIER_KEY_NAMES.has(event.key)) return { type: 'ignore' }

  const hasModifier = event.ctrlKey || event.altKey || event.shiftKey || event.metaKey
  if (!hasModifier && (event.key === 'Backspace' || event.key === 'Delete')) {
    return { type: 'clear' }
  }

  const key = resolveKeyToken(event)
  if (!key) return { type: 'ignore' }

  const modifiers: ShortcutModifier[] = []
  if (event.ctrlKey) modifiers.push('Ctrl')
  if (event.altKey) modifiers.push('Alt')
  if (event.shiftKey) modifiers.push('Shift')
  if (event.metaKey) modifiers.push('Super')

  if (modifiers.length === 0) return { type: 'invalid' }

  return {
    type: 'shortcut',
    value: [...MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier)), key].join('+')
  }
}
