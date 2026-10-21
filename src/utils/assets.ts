import type { AssetType } from '../api/stock'

export function getAssetTitle(assetType: AssetType): string {
  if (assetType === 'fund') {
    return 'A+Fund Assistant'
  }
  if (assetType === 'market') {
    return 'A+Market'
  }
  return 'A+Stock Assistant'
}

/**
 * 标题点击循环保持 股票 ↔ 基金；市场助手点击标题回到自选列表。
 */
export function getNextAssetType(assetType: AssetType): AssetType {
  if (assetType === 'market') {
    return 'stock'
  }
  return assetType === 'stock' ? 'fund' : 'stock'
}
