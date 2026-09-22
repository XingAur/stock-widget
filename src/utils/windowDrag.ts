import { invoke } from '@tauri-apps/api/core'

const INTERACTIVE_DRAG_SELECTOR = [
  'button',
  'input',
  'select',
  'textarea',
  'a',
  'label',
  '[contenteditable]',
  '[data-drag-card]',
  '[data-no-window-drag]'
].join(', ')

/**
 * 判断某个按下目标是否可以发起窗口拖动：
 * 交互控件（按钮/输入框等）、股票卡片（自身可点击/排序）、
 * 以及 SVG 图表（分时 hover、K 线缩放平移）都不应被抢占。
 */
export function isWindowDragTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false
  }
  if (target.closest(INTERACTIVE_DRAG_SELECTOR)) {
    return false
  }
  if (target.closest('svg')) {
    return false
  }
  return true
}

export async function startWindowDrag(event: MouseEvent): Promise<boolean> {
  if (event.button !== 0 || !isWindowDragTarget(event.target)) {
    return false
  }

  try {
    await invoke('start_drag')
    return true
  } catch (error) {
    console.error('Start drag error:', error)
    return false
  }
}
