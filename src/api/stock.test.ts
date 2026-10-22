import { invoke } from '@tauri-apps/api/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchFunds, fetchStocks, fetchGlobalIndices } from './stock'

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

describe('quote API failures', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('surfaces stock refresh failures to the store', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('stock provider timeout'))

    await expect(fetchStocks(['000001'])).rejects.toThrow('stock provider timeout')
  })

  it('surfaces fund refresh failures to the store', async () => {
    vi.mocked(invoke).mockRejectedValueOnce(new Error('fund provider timeout'))

    await expect(fetchFunds(['014855'])).rejects.toThrow('fund provider timeout')
  })

  it('does not turn market provider failures into an empty successful response', async () => {
    vi.mocked(invoke).mockRejectedValueOnce('行情服务返回错误：502 Bad Gateway')
    await expect(fetchGlobalIndices('industry-sectors')).rejects.toBe('行情服务返回错误：502 Bad Gateway')
  })
})
