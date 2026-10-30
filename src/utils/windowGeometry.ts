export type WindowCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface PhysicalRect {
  x: number
  y: number
  width: number
  height: number
}

/**
 * 贴边位置：以显示器工作区（已排除任务栏）为准，窗口边缘紧贴不放间距。
 * 全部按物理像素计算，与 Tauri 的 outerPosition/workArea 口径一致。
 */
export function cornerPosition(
  corner: WindowCorner,
  workArea: PhysicalRect,
  windowSize: { width: number; height: number }
): { x: number; y: number } {
  const x = corner.endsWith('left')
    ? workArea.x
    : workArea.x + workArea.width - windowSize.width
  const y = corner.startsWith('top')
    ? workArea.y
    : workArea.y + workArea.height - windowSize.height
  return { x: Math.round(x), y: Math.round(y) }
}

/** 窗口向左扩展时保持小组件所在的右边缘，展开与收起使用相同物理像素口径。 */
export function anchoredWindowX(
  currentX: number,
  currentPhysicalWidth: number,
  targetPhysicalWidth: number,
  expansionDirection: 'left' | 'right'
): number {
  return expansionDirection === 'left'
    ? currentX + currentPhysicalWidth - targetPhysicalWidth
    : currentX
}
