export function moveItem<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  const nextItems = [...items]

  if (
    !Number.isInteger(fromIndex)
    || !Number.isInteger(toIndex)
    || fromIndex < 0
    || fromIndex >= nextItems.length
  ) {
    return nextItems
  }

  const targetIndex = Math.max(0, Math.min(toIndex, Math.max(nextItems.length - 1, 0)))

  if (fromIndex === targetIndex) {
    return nextItems
  }

  const [item] = nextItems.splice(fromIndex, 1)
  nextItems.splice(targetIndex, 0, item)

  return nextItems
}
