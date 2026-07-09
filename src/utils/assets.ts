import type { AssetType } from '../api/stock'

export function getAssetTitle(assetType: AssetType): string {
  return assetType === 'stock' ? 'A+Stock Assistant' : 'A+Fund Assistant'
}

export function getNextAssetType(assetType: AssetType): AssetType {
  return assetType === 'stock' ? 'fund' : 'stock'
}
