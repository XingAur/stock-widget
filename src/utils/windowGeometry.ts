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
